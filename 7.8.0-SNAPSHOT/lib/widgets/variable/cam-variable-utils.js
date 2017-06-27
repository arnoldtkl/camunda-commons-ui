'use strict';
var fs = require('fs');

var angular = require('camunda-bpm-sdk-js/vendor/angular'),
    typeUtils = require('camunda-bpm-sdk-js/lib/forms/type-util'),

    templateDialog = fs.readFileSync(__dirname + '/cam-widget-variable-dialog.html', 'utf8'),
    templateStringDialog = fs.readFileSync(__dirname + '/cam-widget-string-dialog.html', 'utf8');

var varUtils = {};

function camundaFormattedDate(date) {
  date = date || new Date();
  return date.toISOString().slice(0, -1) + '+0000';
}
varUtils.camundaFormattedDate = camundaFormattedDate;

varUtils.templateDialog = templateDialog;
varUtils.templateStringDialog = templateStringDialog;

varUtils.modalCtrl = [
  '$scope',
  'variable',
  'readonly',
  function(
    $dialogScope,
    variable,
    readonly
  ) {
    $dialogScope.hovered = false;
    $dialogScope.toggleHover = function(which) {
      $dialogScope.hovered = which;
    };

    $dialogScope.variable = variable;
    $dialogScope.readonly = readonly;
    var original = angular.copy(variable);

    $dialogScope.hasChanged = function() {
      original.valueInfo = original.valueInfo || {};
      variable.valueInfo = variable.valueInfo || {};

      return original.value !== variable.value ||
              original.valueInfo.serializationDataFormat !== variable.valueInfo.serializationDataFormat ||
              original.valueInfo.objectTypeName !== variable.valueInfo.objectTypeName;
    };
  }];


varUtils.typeUtils = typeUtils;


varUtils.types = [
  'Boolean',
  'Bytes',
  'File',
  'Date',
  'Double',
  'Integer',
  'Long',
  'Null',
  'Object',
  'Short',
  'String'
];


varUtils.defaultValues = {
  'Boolean':    false,
  'Bytes':      null,
  'File':       null,
  'Date':       camundaFormattedDate(),
  'Double':     0,
  'Integer':    0,
  'Long':       0,
  'Null':       '',
  'Short':      0,
  'String':     '',
  'Object':     {}
};


varUtils.isPrimitive = function($scope) {
  return function(type) {
    if (!type && !$scope.variable) { return true; }
    type = type || $scope.variable.type;
    if (!type) { return true; }

    return [
      'Boolean',
      'Date',
      'Double',
      'Integer',
      'Long',
      'Short',
      'String'
    ].indexOf(type) >= 0;
  };
};


varUtils.isBinary = function($scope) {
  return function(type) {
    if (!type && !$scope.variable) { return false; }
    type = type || $scope.variable.type;
    if (!type) { return false; }

    return [
      'Bytes',
      'File'
    ].indexOf(type) >= 0;
  };
};


varUtils.useCheckbox = function($scope) {
  return function(type) {
    if (!type && !$scope.variable) { return false; }
    type = type || $scope.variable.type;
    return type === 'Boolean';
  };
};

varUtils.validate = function($scope) {
  return function() {
    if (!$scope.variable.name || !$scope.variable.type) {
      $scope.valid = false;
    }

    else if ($scope.variable.value === null ||
               ['String', 'Object', 'Null'].indexOf($scope.variable.type) > -1) {
      $scope.valid = true;
    }

      else {
      $scope.valid = typeUtils.isType($scope.variable.value, $scope.variable.type);
    }

    if($scope.valid) {
        // save the variable in the appropriate type
      if ($scope.variable.type &&
            $scope.variable.value !== null &&
            $scope.isPrimitive($scope.variable.type)) {
        var newTyped;

        if ($scope.variable.type !== 'Boolean') {
          newTyped = typeUtils.convertToType($scope.variable.value, $scope.variable.type);
        }
        else {
          newTyped = $scope.variable.value ?
                        $scope.variable.value !== 'false' :
                        false;
        }

          // only change value if newType has different type, to avoid infinite recursion
        if(typeof $scope.variable.value !== typeof newTyped) {
          $scope.variable.value = newTyped;
        }
      }
    }
  };
};

module.exports = varUtils;
