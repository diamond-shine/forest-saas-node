'use strict';
var _ = require('lodash');
var P = require('bluebird');
var humps = require('humps');
var Schemas = require('../generators/schemas');

function ResourceDeserializer(model, params) {
  var schema = Schemas.schemas[model.tableName];

  function extractAttributes() {
    return new P(function (resolve) {
      var attributes = params.data.attributes;
      attributes._id = params.data.id;
      resolve(attributes);
    });
  }

  function extractRelationships() {
    return new P(function (resolve) {
      var relationships = {};

      _.each(schema.fields, function (field) {
        if (field.reference && params.data.relationships &&
          params.data.relationships[field.field]) {
          if (params.data.relationships[field.field].data === null) {
            // Remove the relationships
            relationships[field.field] = null;
          } else if (params.data.relationships[field.field].data) {
            // Set the relationship
            relationships[field.field] = params.data.relationships[field.field]
              .data.id;
          }  // Else ignore the relationship
        }
      });

      resolve(relationships);
    });
  }

  this.perform = function () {
    return P.all([extractAttributes(), extractRelationships()])
      .spread(function (attributes, relationships) {
        return humps.camelizeKeys(_.extend(attributes, relationships));
      });
  };
}

module.exports = ResourceDeserializer;
