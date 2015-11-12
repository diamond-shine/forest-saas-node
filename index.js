'use strict';
var _ = require('lodash');
var P = require('bluebird');
var express = require('express');
var cors = require('express-cors');
var bodyParser = require('body-parser');
var jwt = require('express-jwt');
var ResourcesRoutes = require('./routes/resources');
var StripeRoutes = require('./routes/stripe');
var StatRoutes = require('./routes/stats');
var Schemas = require('./generators/schemas');
var SchemaAdapter = require('./adapters/sequelize');
var JSONAPISerializer = require('jsonapi-serializer');
var request = require('superagent');
var logger = require('./services/logger');

function mapSeries(things, fn) {
  var results = [];
  return P.each(things, function (value, index, length) {
    var ret = fn(value, index, length);
    results.push(ret);
    return ret;
  }).thenReturn(results).all();
}

exports.init = function (opts) {
  var app = express();

  // CORS
  app.use(cors({
    allowedOrigins: ['http://localhost:4200', 'https://www.forestadmin.com',
      'http://www.forestadmin.com'],
      headers: ['Authorization', 'X-Requested-With', 'Content-Type',
        'Stripe-Secret-Key', 'Stripe-Reference']
  }));

  // Mime type
  app.use(bodyParser.json({type: 'application/vnd.api+json'}));

  // Authentication
  app.use(jwt({
    secret: opts.jwtSigningKey,
    credentialsRequired: false
  }));

  // Default override middleware.
  var middleware = function (req, res, next) { next(); };
  if (!opts.resources) { opts.resources = {}; }
  if (!opts.resources.list) { opts.resources.list = middleware; }
  if (!opts.resources.get) { opts.resources.get = middleware; }
  if (!opts.resources.create) { opts.resources.create = middleware; }
  if (!opts.resources.update) { opts.resources.update = middleware; }
  if (!opts.resources.remove) { opts.resources.remove = middleware; }

  // Init
  new P(function (resolve) { resolve(opts.sequelize.models); })
    .then(function (models) {
      return Schemas.perform(models, opts)
        .then(function () {
          return _.values(models);
        });
    })
    .each(function (model) {
      new ResourcesRoutes(app, model, opts).perform();
      new StatRoutes(app, model, opts).perform();
    })
    .then(function (models) {
      new StripeRoutes(app, opts).perform();
      return models;
    })
    .then(function (models) {
      if (opts.jwtSigningKey) {
        mapSeries(models, function (model) {
          return new SchemaAdapter(model, opts);
        })
        .then(function (collections) {
          return new JSONAPISerializer('collections', collections, {
            id: 'name',
            attributes: ['name', 'fields'],
            fields: {
              attributes: ['field', 'type', 'collection_name']
            },
            meta: {
              'liana': 'forest-express-sequelize',
              'liana_version': require('./package.json').version
            }
          });
        })
        .then(function (json) {
          var forestUrl = process.env.FOREST_URL ||
            'https://forestadmin-server.herokuapp.com';

          request
            .post(forestUrl + '/forest/apimaps')
              .send(json)
              .set('forest-secret-key', opts.jwtSigningKey)
              .end(function(err, res) {
                if (res.status !== 204) {
                  logger.debug('Forest cannot find your project secret key. ' +
                    'Please, ensure you have installed the Forest Liana ' +
                    'correctly.');
                }
              });
        });
      }
    });

  return app;
};

exports.ensureAuthenticated = require('./services/auth').ensureAuthenticated;
exports.StatSerializer = require('./serializers/stat') ;
exports.ResourceSerializer = require('./serializers/resource') ;
