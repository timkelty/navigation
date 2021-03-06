<?php
namespace verbb\navigation\elements;

use verbb\navigation\Navigation;
use verbb\navigation\elements\db\NodeQuery;
use verbb\navigation\models\Nav as NavModel;
use verbb\navigation\records\Nav as NavRecord;
use verbb\navigation\records\Node as NodeRecord;

use Craft;
use craft\base\Element;
use craft\controllers\ElementIndexesController;
use craft\db\Query;
use craft\elements\actions\Delete;
use craft\elements\actions\Edit;
use craft\elements\actions\NewChild;
use craft\elements\actions\SetStatus;
use craft\elements\actions\View;
use craft\elements\db\ElementQueryInterface;
use craft\helpers\Html;
use craft\helpers\Template;
use craft\helpers\UrlHelper;

use yii\base\Exception;
use yii\base\InvalidConfigException;

class Node extends Element
{
    // Static
    // =========================================================================

    public static function displayName(): string
    {
        return Craft::t('navigation', 'Navigation Node');
    }

    public static function refHandle()
    {
        return 'node';
    }

    public static function hasContent(): bool
    {
        return true;
    }

    public static function hasTitles(): bool
    {
        return true;
    }

    public static function hasUris(): bool
    {
        return false;
    }

    public static function isLocalized(): bool
    {
        return true;
    }

    public static function hasStatuses(): bool
    {
        return true;
    }

    public static function find(): ElementQueryInterface
    {
        return new NodeQuery(static::class);
    }

    // Properties
    // =========================================================================

    public $id;
    public $elementId;
    public $siteId;
    public $navId;
    public $enabled = true;
    public $type;
    public $classes;
    public $newWindow = false;

    public $_url;
    public $element;
    public $elementDisplayName;
    public $newParentId;
    private $_hasNewParent;

    // Public Methods
    // =========================================================================

    public function init()
    {
        $element = $this->getElement();

        parent::init();
    }

    public function getElement()
    {
        if ($this->elementId) {
            $this->element = Craft::$app->getElements()->getElementById($this->elementId, null, $this->siteId);
            $this->elementDisplayName = $this->element->displayName();

            return $this->element;
        }

        return null;
    }

    public function getActive()
    {
        $activeChild = false;
        $relativeUrl = str_replace(UrlHelper::siteUrl(), '', $this->getUrl());
        $currentUrl = implode('/', Craft::$app->getRequest()->getSegments());
        $isHomepage = (bool)($this->getUrl() === UrlHelper::siteUrl());

        // If manual URL, make sure to remove a leading '/' for comparison
        if ($this->isManual()) {
            $relativeUrl = ltrim($relativeUrl, '/');
        }

        $isActive = (bool)($currentUrl === $relativeUrl);

        // Also check if any children are active
        if ($this->children) {
            foreach ($this->children->all() as $child) {
                if ($child->active) {
                    $activeChild = $child->active;
                }
            }
        }

        // Then, provide a helper based purely on the URL structure.
        // /example-page and /example-page/nested-page should both be active, even if both aren't nodes.
        if (substr($currentUrl, 0, strlen($relativeUrl)) === $relativeUrl) {
            if (!$isHomepage) {
                $isActive = true;
            }
        }
        
        return $isActive || $activeChild;
    }

    public function getUrl()
    {
        $url = $this->_url;

        if (!$url) {
            if ($this->element) {
                $url = $this->element->url;
            }
        }

        return $url;
    }

    public function setUrl($value)
    {
        $this->_url = $value;
        return $this;
    }

    public function getLink()
    {
        $url = $this->getUrl();

        return Template::raw('<a href="' . $url . '">' . Html::encode($this->__toString()) . '</a>');
    }

    public function getNav()
    {
        if ($this->navId === null) {
            throw new InvalidConfigException('Node is missing its navigation ID');
        }

        $nav = Navigation::$plugin->navs->getNavById($this->navId);

        if (!$nav) {
            throw new InvalidConfigException('Invalid navigation ID: ' . $this->navId);
        }

        return $nav;
    }

    public function isManual()
    {
        return (bool)!$this->type;
    }

    // Events
    // -------------------------------------------------------------------------

    public function beforeSave(bool $isNew): bool
    {
        if ($this->_hasNewParent()) {
            if ($this->newParentId) {
                $parentNode = Navigation::$plugin->nodes->getNodeById($this->newParentId, $this->siteId);

                if (!$parentNode) {
                    throw new Exception('Invalid node ID: ' . $this->newParentId);
                }
            } else {
                $parentNode = null;
            }

            $this->setParent($parentNode);
        }

        return parent::beforeSave($isNew);
    }

    public function afterSave(bool $isNew)
    {
        // Get the node record
        if (!$isNew) {
            $record = NodeRecord::findOne($this->id);

            if (!$record) {
                throw new Exception('Invalid node ID: ' . $this->id);
            }
        } else {
            $record = new NodeRecord();
            $record->id = $this->id;
        }

        $record->elementId = $this->elementId;
        $record->navId = $this->navId;
        $record->url = $this->url;
        $record->type = $this->type;
        $record->classes = $this->classes;
        $record->newWindow = $this->newWindow;

        // Don't store the URL if its an element. We should rely on its element URL.
        if ($this->type) {
            $record->url = null;
        }

        $record->save(false);

        $this->id = $record->id;

        $this->element = $this->getElement();

        $nav = $this->getNav();

        // Has the parent changed?
        if ($this->_hasNewParent()) {
            if (!$this->newParentId) {
                Craft::$app->getStructures()->appendToRoot($nav->structureId, $this);
            } else {
                Craft::$app->getStructures()->append($nav->structureId, $this, $this->getParent());
            }
        }

        parent::afterSave($isNew);
    }

    // Private Methods
    // =========================================================================

    private function _hasNewParent(): bool
    {
        if ($this->_hasNewParent !== null) {
            return $this->_hasNewParent;
        }

        return $this->_hasNewParent = $this->_checkForNewParent();
    }

    private function _checkForNewParent(): bool
    {
        // Is it a brand new node?
        if ($this->id === null) {
            return true;
        }

        // Was a new parent ID actually submitted?
        if ($this->newParentId === null) {
            return false;
        }

        // Is it set to the top level now, but it hadn't been before?
        if (!$this->newParentId && $this->level != 1) {
            return true;
        }

        // Is it set to be under a parent now, but didn't have one before?
        if ($this->newParentId && $this->level == 1) {
            return true;
        }

        // Is the newParentId set to a different node ID than its previous parent?
        $oldParentQuery = self::find();
        $oldParentQuery->ancestorOf($this);
        $oldParentQuery->ancestorDist(1);
        $oldParentQuery->status(null);
        $oldParentQuery->siteId($this->siteId);
        $oldParentQuery->enabledForSite(false);
        $oldParentQuery->select('elements.id');
        $oldParentId = $oldParentQuery->scalar();

        return $this->newParentId != $oldParentId;
    }
}
