// ==========================================================================

// Navigation Plugin for Craft CMS
// Author: Verbb - https://verbb.io/

// ==========================================================================

if (typeof Craft.Navigation === typeof undefined) {
    Craft.Navigation = {};
}

(function($) {

Craft.Navigation = Garnish.Base.extend({
    nav: null,
    siteId: null,

    structure: null,
    structureElements: {},
    elementType: null,
    elementModals: [],

    $builderContainer: $('.js-nav-builder'),
    $structureContainer: $('.js-nav-builder .structure'),
    $emptyContainer: $('.js-navigation-empty'),
    $addElementButton: $('.js-btn-element-add'),
    $addElementLoader: $('.nav-content-pane .buttons .spinner'),
    $manualForm: $('#manual-form'),
    $manualLoader: $('#manual-form .spinner'),
    $template: $('#js-node-template').html(),

    init: function(nav, settings) {
        this.nav = nav;
        this.siteId = settings.siteId;

        this.structure = this.$structureContainer.data('structure');

        var $structureElements = this.$structureContainer.find('li');

        for (var i = 0; i < $structureElements.length; i++) {
            var $structureElement = $($structureElements[i]),
                id = $structureElement.find('.element').data('id');

            this.structureElements[id] = new Craft.Navigation.StructureElement(this, $structureElement);
        }

        this.addListener(this.$addElementButton, 'activate', 'showModal');
        this.addListener(this.$manualForm, 'submit', 'onManualSubmit');
    },

    showModal: function(e) {
        this.elementType = $(e.currentTarget).data('element-type');

        if (!this.elementModals[this.elementType]) {
            this.elementModals[this.elementType] = this.createModal(this.elementType);
        } else {
            this.elementModals[this.elementType].show();
        }
    },

    createModal: function(elementType) {
        return Craft.createElementSelectorModal(elementType, {
            criteria: {
                enabledForSite: null,
                siteId: this.siteId,
            },
            sources: '*',
            multiSelect: true,
            onSelect: $.proxy(this, 'onModalSelect'),
        });
    },

    onModalSelect: function(elements) {
        var $optionsContainer = $('.tab-list-item[data-element-type="' + this.elementType.replace(/\\/ig, '\\\\') + '"]');
        var parentId = $optionsContainer.find('.js-parent-node select').val();
        var newWindow = $optionsContainer.find('#newWindow-field input').val();

        for (var i = 0; i < elements.length; i++) {
            var element = elements[i];

            // Unselect element in modal
            this.elementModals[this.elementType].$body.find('tr[data-id="' + element.id + '"]').removeClass('sel');

            var data = {
                navId: this.nav.id,
                siteId: this.siteId,
                elementId: element.id,
                title: element.label,
                url: element.url,
                type: this.elementType,
                newWindow: newWindow,
                parentId: parentId,
            };

            this.saveNode(data);
        }
    },

    onManualSubmit: function(e) {
        e.preventDefault();

        var parentId = this.$manualForm.find('.js-parent-node select').val();
        var newWindow = this.$manualForm.find('#newWindow-field input').val();

        var data = {
            navId: this.nav.id,
            siteId: this.siteId,
            title: this.$manualForm.find('#title').val(),
            url: this.$manualForm.find('#url').val(),
            newWindow: newWindow,
            parentId: parentId,
        };

        this.saveNode(data);
    },

    addNode: function(data) {
        var nodeHtml = this.$template
            .replace(/__siteId__/ig, data.siteId ? data.siteId : "")
            .replace(/__status__/ig, data.enabled ? 'enabled' : 'disabled')
            .replace(/__title__/ig, data.title)
            .replace(/__id__/ig, data.id)
            .replace(/__url__/ig, data.url)
            .replace(/__type__/ig, data.elementDisplayName ? data.elementDisplayName : 'manual')

        var $node = $(nodeHtml);

        var $appendTo = this.structure.$container;

        if (data.newParentId > 0) {
            var $li = this.structure.$container.find('.element[data-id="' + data.newParentId + '"]').closest('li');
            var $parentContainer = $li.find('> ul');
            var parentLevel = $li.data('level');

            if (!$parentContainer.length) {
                $parentContainer = $('<ul/>');
                $parentContainer.appendTo($li);
            }

            $appendTo = $parentContainer;
        }

        $node.appendTo($appendTo);
        this.structure.structureDrag.addItems($node);

        $node.css('margin-bottom', -30);
        $node.velocity({'margin-bottom': 0}, 'fast');

        return $node;
    },

    saveNode: function(data) {
        this.$manualLoader.removeClass('hidden');
        this.$addElementLoader.removeClass('hidden');

        Craft.postActionRequest('navigation/nodes/save-node', data, $.proxy(function(response, textStatus) {
            this.$manualLoader.addClass('hidden');
            this.$addElementLoader.addClass('hidden');

            if (response.success) {
                this.$manualForm.find('#title').val('');
                this.$manualForm.find('#url').val('');

                var id = response.node.id;
                var $structureElement = this.addNode(response.node);

                this.structureElements[id] = new Craft.Navigation.StructureElement(this, $structureElement);

                this.$emptyContainer.addClass('hidden');

                generateSelect(response.parentOptions);

                Craft.cp.displayNotice(Craft.t('navigation', 'Node added.'));
            } else {
                Craft.cp.displayError(response.message);
            }
        }, this));
    },

});

Craft.Navigation.StructureElement = Garnish.Base.extend({
    container: null,
    structure: null,

    $node: null,
    $elements: null,
    $element: null,
    $settingsBtn: null,
    $deleteBtn: null,

    init: function (container, $node) {
        this.container = container;
        this.structure = container.structure;
        this.$node = $node;
        this.$element = $node.find('.element:first');

        this.$settingsBtn = this.$node.find('.settings:first');
        this.$deleteBtn = this.$node.find('.delete:first');

        this.structure.structureDrag.settings.onDragStop = $.proxy(this, 'onDragStop');

        this.addListener(this.$settingsBtn, 'click', 'showSettings');
        this.addListener(this.$element, 'dblclick', 'showSettings');
        this.addListener(this.$deleteBtn, 'click', 'removeNode');
    },

    onDragStop: function() {
        var nodeId = this.$element.data('id');
        var siteId = this.$element.data('site-id');
        var navId = this.container.nav.id;

        var data = {
            nodeId: nodeId,
            siteId: siteId,
            navId: navId,
        };

        setTimeout(function() {
            Craft.postActionRequest('navigation/nodes/move', data, $.proxy(function(response, textStatus) {
                if (response.success) {
                    generateSelect(response.parentOptions);
                }
            }, this));
        }, 500);
    },

    showSettings: function() {
        new Craft.Navigation.Editor(this.$element);
    },

    removeNode: function() {
        var nodeIds = [];
        var $nodes = this.$node.find('.element');

        // Create an array of element (node) ids to delete - we want to not have leftover nodes
        for (var i = 0; i < $nodes.length; i++) {
            nodeIds[i] = $($nodes[i]).data('id');
        }

        var confirmation = confirm(Craft.t('navigation', 'Are you sure you want to delete “{title}” and its descendants?', { title: this.$element.data('label') }));

        if (confirmation) {
            Craft.postActionRequest('navigation/nodes/delete', { nodeIds: nodeIds }, $.proxy(function(response, textStatus) {
                if (response.success) {
                    Craft.cp.displayNotice(Craft.t('navigation', 'Node deleted.'));

                    generateSelect(response.parentOptions);

                    // Remove from structure and container (again, we're deleting multiples)
                    $nodes.each($.proxy(function(index, element) {
                        this.structure.removeElement($(element));
                        delete this.container.structureElements[$(element).data('id')];
                    }, this));

                    // Check if there are none at all
                    if (Object.keys(this.container.structureElements).length == 0) {
                        this.container.$emptyContainer.removeClass('hidden');
                    }
                } else {
                    Craft.cp.displayError(response.errors);
                }
            }, this));
        }
    },

});

Craft.Navigation.Editor = Garnish.Base.extend({
    $node: null,
    nodeId: null,
    siteId: null,

    $form: null,
    $fieldsContainer: null,
    $cancelBtn: null,
    $saveBtn: null,
    $spinner: null,

    hud: null,

    init: function($node) {
        this.$node = $node;
        this.nodeId = $node.data('id');
        this.siteId = $node.data('site-id');

        this.$node.addClass('loading');

        var data = {
            nodeId: this.nodeId,
            siteId: this.siteId,
        };

        Craft.postActionRequest('navigation/nodes/editor', data, $.proxy(this, 'showEditor'));
    },

    showEditor: function(response, textStatus) {
        if (response.success) {
            this.$node.removeClass('loading');

            var $hudContents = $();

            this.$form = $('<form/>');
            $('<input type="hidden" name="nodeId" value="' + this.nodeId + '">').appendTo(this.$form);
            $('<input type="hidden" name="siteId" value="' + this.siteId + '">').appendTo(this.$form);
            this.$fieldsContainer = $('<div class="fields"/>').appendTo(this.$form);

            this.$fieldsContainer.html(response.html)
            Craft.initUiElements(this.$fieldsContainer);

            var $footer = $('<div class="hud-footer"/>').appendTo(this.$form),
                $buttonsContainer = $('<div class="buttons right"/>').appendTo($footer);

            this.$cancelBtn = $('<div class="btn">' + Craft.t('app', 'Cancel') + '</div>').appendTo($buttonsContainer);
            this.$saveBtn = $('<input class="btn submit" type="submit" value="' + Craft.t('app', 'Save') + '"/>').appendTo($buttonsContainer);
            this.$spinner = $('<div class="spinner left hidden"/>').appendTo($buttonsContainer);

            $hudContents = $hudContents.add(this.$form);

            this.hud = new Garnish.HUD(this.$node, $hudContents, {
                bodyClass: 'body nav-editor-hud',
                closeOtherHUDs: false,
            });

            this.hud.on('hide', $.proxy(function() {
                delete this.hud;
            }, this));

            this.addListener(this.$saveBtn, 'click', 'saveNode');
            this.addListener(this.$cancelBtn, 'click', 'closeHud');
        }
    },

    saveNode: function(e) {
        e.preventDefault();

        this.$spinner.removeClass('hidden');

        var data = this.$form.serialize();
        var $status = this.$node.parent().find('.status');
        var $target = this.$node.find('.target');

        Craft.postActionRequest('navigation/nodes/save-node', data, $.proxy(function(response, textStatus) {
            this.$spinner.addClass('hidden');

            if (response.success) {
                Craft.cp.displayNotice(Craft.t('navigation', 'Node updated.'));

                generateSelect(response.parentOptions);

                this.$node.parent().data('label', response.node.title);
                this.$node.parent().find('.title').text(response.node.title);
                
                if (response.node.enabled) {
                    $status.addClass('enabled');
                    $status.removeClass('disabled');
                } else {
                    $status.addClass('disabled');
                    $status.removeClass('enabled');
                }

                this.closeHud();
            } else {
                Garnish.shake(this.hud.$hud);
                Craft.cp.displayError(response.errors);
            }
        }, this));
    },

    closeHud: function() {
        this.hud.hide();
        delete this.hud;
    },

});

function generateSelect(options) {
    var html = '';

    $.each(options, function(index, value) {
        var disabled = value.disabled ? 'disabled' : '';
        html += '<option value="' + value.value + '" ' + disabled + '>' + value.label + '</option>';
    });

    $('select[name="parent"]').each(function(index, element) {
        var selected = $(element).val();

        $(element).html(html);
        $(element).val(selected);
    });
    
}


})(jQuery);
