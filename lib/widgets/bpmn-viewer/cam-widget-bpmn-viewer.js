'use strict';
var fs = require('fs');

var angular = require('camunda-bpm-sdk-js/vendor/angular'),

    Viewer = require('../../util/viewer'),

    template = fs.readFileSync(__dirname + '/cam-widget-bpmn-viewer.html', 'utf8');

module.exports = ['$q', '$document', '$compile', '$location', '$rootScope', 'search', 'debounce',
  function($q, $document, $compile,   $location,   $rootScope,   search, debounce) {

    return {
      scope: {
        diagramData: '=',
        key: '@',
        control: '=?',
        disableNavigation: '&',
        onLoad: '&',
        onClick: '&',
        onMouseEnter: '&',
        onMouseLeave: '&'
      },

      template: template,

      link: function($scope, $element) {

        var definitions;
        var diagramContainer = $element[0].querySelector('.diagram-holder');

        function attachDiagram() {
          diagramContainer.appendChild(viewer._container);
        }

        function detatchDiagram() {
          diagramContainer.removeChild(viewer._container);
        }

        $scope.grabbing = false;

        // parse boolean
        $scope.disableNavigation = $scope.$eval($scope.disableNavigation);

        // --- CONTROL FUNCTIONS ---
        $scope.control = $scope.control || {};

        $scope.control.highlight = function(id) {
          canvas.addMarker(id, 'highlight');

          $element.find('[data-element-id="'+id+'"]>.djs-outline').attr({
            rx: '14px',
            ry: '14px'
          });
        };

        $scope.control.clearHighlight = function(id) {
          canvas.removeMarker(id, 'highlight');
        };

        $scope.control.isHighlighted = function(id) {
          return canvas.hasMarker(id, 'highlight');
        };

        // config: text, tooltip, color, position
        $scope.control.createBadge = function(id, config) {
          var overlays = viewer.get('overlays');

          var htmlElement;
          if(config.html) {
            htmlElement = config.html;
          } else {
            htmlElement = document.createElement('span');
            if(config.color) {
              htmlElement.style['background-color'] = config.color;
            }
            if(config.tooltip) {
              htmlElement.setAttribute('tooltip', config.tooltip);
              htmlElement.setAttribute('tooltip-placement', 'top');
            }
            if(config.text) {
              htmlElement.appendChild(document.createTextNode(config.text));
            }
          }

          var overlayId = overlays.add(id, {
            position: config.position || {
              bottom: 0,
              right: 0
            },
            show: {
              minZoom: -Infinity,
              maxZoom: +Infinity
            },
            html: htmlElement
          });

          $compile(htmlElement)($scope);

          return overlayId;
        };

        // removes all badges for an element with a given id
        $scope.control.removeBadges = function(id) {
          viewer.get('overlays').remove({element:id});
        };

        // removes a single badge with a given id
        $scope.control.removeBadge = function(id) {
          viewer.get('overlays').remove(id);
        };

        $scope.control.getViewer = function() {
          return viewer;
        };

        $scope.control.scrollToElement = function(element) {
          var height, width, x, y;

          var elem = viewer.get('elementRegistry').get(element);
          var viewbox = canvas.viewbox();

          height = Math.max(viewbox.height, elem.height);
          width  = Math.max(viewbox.width,  elem.width);

          x = Math.min(Math.max(viewbox.x, elem.x - viewbox.width + elem.width), elem.x);
          y = Math.min(Math.max(viewbox.y, elem.y - viewbox.height + elem.height), elem.y);

          canvas.viewbox({
            x: x,
            y: y,
            width: width,
            height: height
          });
        };

        $scope.control.getElement = function(elementId) {
          return viewer.get('elementRegistry').get(elementId);
        };

        $scope.control.getElements = function(filter) {
          return viewer.get('elementRegistry').filter(filter);
        };

        $scope.loaded = false;
        $scope.control.isLoaded = function() {
          return $scope.loaded;
        };

        $scope.control.addAction = function(config) {
          var container = $element.find('.actions');
          var htmlElement = config.html;
          container.append(htmlElement);
          $compile(htmlElement)($scope);
        };

        var heatmapImage;

        $scope.control.addImage = function(image, x, y) {
          return preloadImage(image)
            .then(
              function(preloadedElement) {
                var width = preloadedElement.offsetWidth;
                var height = preloadedElement.offsetHeight;
                var imageElement = $document[0].createElementNS('http://www.w3.org/2000/svg', 'image');

                imageElement.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', image);
                imageElement.setAttributeNS(null, 'width', width);
                imageElement.setAttributeNS(null, 'height', height);
                imageElement.setAttributeNS(null, 'x', x);
                imageElement.setAttributeNS(null, 'y', y);

                $document[0].body.removeChild(preloadedElement);
                canvas._viewport.appendChild(imageElement);

                heatmapImage = angular.element(imageElement);
                return heatmapImage;
              },
              function(preloadedElement) {
                $document[0].body.removeChild(preloadedElement);
              }
            );
        };

        function preloadImage(img) {
          var body = $document[0].body;
          var deferred = $q.defer();
          var imageElement = angular.element('<img>')
            .css('position', 'absolute')
            .css('left', '-9999em')
            .css('top', '-9999em')
            .attr('src', img)[0];

          imageElement.onload = function() {
            deferred.resolve(imageElement);
          };

          imageElement.onerror = function() {
            deferred.reject(imageElement);
          };

          body.appendChild(imageElement);

          return deferred.promise;
        }

        var viewer = Viewer.generateViewer({
          width: '100%',
          height: '100%',
          canvas: {
            deferUpdate: false
          },
          key: $scope.key,
          disableNavigation: $scope.disableNavigation
        });

        if(!viewer.cached) {
          // attach diagram immediately to avoid having the bpmn logo for viewers that are not cached
          attachDiagram();
        }


        // The following logic mirrors diagram-js to defer its update of the viewbox change.
        // We tell diagram-js to not defer the update (see above) and do it ourselves instead.
        // Only difference: We use a delay of 0. This causes the update to basically be propagated
        // immediately after the current execution is finished (instead of halting the execution
        // until the viewbox changes and all event listeners are executed). This results in a much
        // better performance while moving the diagram, but at a cost: In the interval between the
        // trigger of the viewbox change and the calculation of the event handlers in the debounced
        // execution, things like badges or migration arrows are at the wrong position; they feel
        // like they are "dragged behind". Therefore, we temporarily hide the overlays.

        // patch show and hide of overlays
        var originalShow = viewer.get('overlays').show.bind(viewer.get('overlays'));
        viewer.get('overlays').show = function() {
          viewer.get('eventBus').fire('overlays.show');
          originalShow();
        };

        var originalHide = viewer.get('overlays').hide.bind(viewer.get('overlays'));
        viewer.get('overlays').hide = function() {
          viewer.get('eventBus').fire('overlays.hide');
          originalHide();
        };

        var showAgain = debounce(function() {
          viewer.get('overlays').show();
        }, 300);

        var originalViewboxChanged = viewer.get('canvas')._viewboxChanged.bind(viewer.get('canvas'));
        var debouncedOriginal = debounce(function() {
          originalViewboxChanged();
          viewer.get('overlays').hide();
          showAgain();
        }, 0);
        viewer.get('canvas')._viewboxChanged = function() {
          debouncedOriginal();
        };


        var diagramData = null;
        var canvas = null;

        $scope.$watch('diagramData', function(newValue) {
          if (newValue) {
            diagramData = newValue;
            renderDiagram();
          }
        });

        function handleViewerLoad() {
          canvas = viewer.get('canvas');
          definitions = viewer._definitions;
          setupEventListeners();
          zoom();
          $scope.loaded = true;
        }

        function renderDiagram() {
          // if there is a cached viewer, no need to import data
          if(viewer.cached) {
            attachDiagram();
            handleViewerLoad();
            return $scope.onLoad();

          } else if (diagramData) {
            $scope.loaded = false;

            var useDefinitions = (typeof diagramData === 'object');

            var importFunction = (useDefinitions ? viewer.importDefinitions : viewer.importXML).bind(viewer);

            importFunction(diagramData, function(err, warn) {

              var applyFunction = useDefinitions ? function(fn) {fn();} : $scope.$apply.bind($scope);

              applyFunction(function() {
                if (err) {
                  $scope.error = err;
                  return;
                }

                $scope.warn = warn;

                handleViewerLoad();
                return $scope.onLoad();
              });
            });

          }

        }


        function zoom() {
          if (canvas) {
            var viewbox = JSON.parse(($location.search() || {}).viewbox || '{}')[definitions.id];

            if (viewbox) {
              canvas.viewbox(viewbox);
            }
            else {
              canvas.zoom('fit-viewport', 'auto');
            }
          }
        }

        var mouseReleaseCallback = function() {
          $scope.grabbing = false;
          document.removeEventListener('mouseup', mouseReleaseCallback);
          $scope.$apply();
        };

        function onClick(e) {
          // e.element = the model element
          // e.gfx = the graphical element
          $scope.onClick({element: e.element, $event: e.originalEvent});
        }

        function onHover(e) {
          $scope.onMouseEnter({element: e.element, $event: e.originalEvent});
        }

        function onOut(e) {
          $scope.onMouseLeave({element: e.element, $event: e.originalEvent});
        }

        function onMousedown() {
          $scope.grabbing = true;
          document.addEventListener('mouseup', mouseReleaseCallback);
          $scope.$apply();
        }

        var onViewboxChange = debounce(function(e) {
          var viewbox = JSON.parse(($location.search() || {}).viewbox || '{}');

          viewbox[definitions.id] = {
            x: e.viewbox.x,
            y: e.viewbox.y,
            width: e.viewbox.width,
            height: e.viewbox.height
          };

          search.updateSilently({
            viewbox: JSON.stringify(viewbox)
          });

          var phase = $rootScope.$$phase;
          if (phase !== '$apply' && phase !== '$digest') {
            $scope.$apply(function() {
              $location.replace();
            });
          } else {
            $location.replace();
          }
        }, 500);


        function setupEventListeners() {
          var eventBus = viewer.get('eventBus');
          eventBus.on('element.click', onClick);
          eventBus.on('element.hover', onHover);
          eventBus.on('element.out', onOut);
          eventBus.on('element.mousedown', onMousedown);
          eventBus.on('canvas.viewbox.changed', onViewboxChange);
        }

        function clearEventListeners() {
          var eventBus = viewer.get('eventBus');
          eventBus.off('element.click', onClick);
          eventBus.off('element.hover', onHover);
          eventBus.off('element.out', onOut);
          eventBus.off('element.mousedown', onMousedown);
          eventBus.off('canvas.viewbox.changed', onViewboxChange);
        }

        $scope.zoomIn = function() {
          viewer.get('zoomScroll').zoom(1, {
            x: $element[0].offsetWidth / 2,
            y: $element[0].offsetHeight / 2
          });
        };

        $scope.zoomOut = function() {
          viewer.get('zoomScroll').zoom(-1, {
            x: $element[0].offsetWidth / 2,
            y: $element[0].offsetHeight / 2
          });
        };

        $scope.resetZoom = function() {
          canvas.resized();
          canvas.zoom('fit-viewport', 'auto');
        };

        $scope.control.resetZoom = $scope.resetZoom;

        $scope.control.refreshZoom = function() {
          canvas.resized();
          canvas.zoom(canvas.zoom(), 'auto');
        };

        $scope.$on('$destroy', function() {
          detatchDiagram();
          clearEventListeners();
          viewer.get('overlays').clear();
          Viewer.cacheViewer({ key: $scope.key, viewer: viewer });
        });

      }
    };
  }];
