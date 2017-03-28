'use strict';
/* global strapi _ */

const async = require('async');
const regex = require('strapi/util/regex');

exports.create = function () {
  const deferred = Promise.defer();
  const promises = [];
  const newRoutes = [];
  let routes;

  async.auto({
    findRoutes: function (cb) {

      // Find all routes.
      strapi.orm
        .collections
        .route
        .find()
        .exec(function (err, routes) {
          err ? cb(err) : cb(null, routes)
        });
    },
    deleteRoutes: ['findRoutes', function (cb, results) {
      routes = results.findRoutes;

      // Delete destroyed routes.
      _.forEach(routes, function (route) {
        if (!strapi.config.routes[route.name]) {
          promises.push(strapi.orm.collections.route.destroy({id: route.id}));
        }
      });

      cb(null);
    }],
    updateOrCreateRoutes: ['findRoutes', function (cb, results) {

      // Async dependencies.
      routes = results.findRoutes;
      let verb;

      // Find or create routes.
      _.forEach(strapi.config.routes, function (route, key) {
        verb = regex.detectRoute(key).verb;

        // Check if the controller is a stringified function.
        route.controller = _.startsWith(route.controller, 'function') ? 'Specific function' : route.controller;

        if (_.find(routes, {name: key})) {
          promises.push(strapi.orm.collections.route.update({
            name: _.trim(key)
          }, {
            name: _.trim(key),
            policies: route.policies,
            controller: _.trim(route.controller),
            action: _.trim(route.action),
            verb: _.trim(verb)
          }));
        } else {
          newRoutes.push(_.trim(key));
          promises.push(strapi.orm.collections.route.create({
            name: _.trim(key),
            policies: route.policies,
            controller: route.controller,
            action: _.trim(route.action),
            verb: _.trim(verb)
          }));
        }
      });

      cb(null);
    }],
    execRoutesModifications: ['deleteRoutes', 'updateOrCreateRoutes', function (callback) {

      // Exec the promises.
      Promise.all(promises)
        .then(function (responses) {
          callback(null, responses);
        })
        .catch(function (err) {
          callback(err);
        });
    }],

    findNewRoutes: ['execRoutesModifications', function (callback) {

      // Find created routes.
      strapi.orm
        .collections
        .route
        .find({
          'name': newRoutes
        })
        .populate('roles')
        .exec(function (err, newRoutesFound) {
          if (err) {
            callback(err);
          } else {
            callback(null, newRoutesFound);
          }
        });
    }],
    updateCreatedRoutes: ['execRoutesModifications', 'findNewRoutes', 'findRoles', function (callback, results) {

      // Async dependencies.
      const newRoutesFound = results.findNewRoutes;
      const roles = results.findRoles;

      const userContributorRoutes = [
        'GET /user/:id',
        'PUT /user/:id',
        'DELETE /user/:id'
      ];

      const userRegisteredRoutes = [
        'PUT /user/:id',
        'DELETE /user/:id'
      ];

      let verb;

      const adminRole = _.find(roles, {
        name: 'admin'
      });

      _.forEach(newRoutesFound, function (newRoute) {
        if (!_.contains(newRoute.name, '/dashboard')) {

          // Contributor permissions.
          verb = regex.detectRoute(newRoute.name).verb;
          newRoute.verb = _.trim(verb);
          newRoute.isPublic = false;
          newRoute.registeredAuthorized = false;
          newRoute.contributorsAuthorized = false;

          if (_.contains(newRoute.name, '/auth')) {
            newRoute.isPublic = true;
          } else if (_.contains(newRoute.name, '/user')) {
            if (_.contains(userContributorRoutes, newRoute.name)) {
              newRoute.contributorsAuthorized = true;
            }
            if (_.contains(userRegisteredRoutes, newRoute.name)) {
              newRoute.registeredAuthorized = true;
            }
          } else {
            if (verb === 'get') {
              newRoute.isPublic = true;
              newRoute.registeredAuthorized = true;
            }

            newRoute.contributorsAuthorized = true;
          }

          newRoute.roles.add(adminRole.id);

          promises.push(new Promise(function (resolve, reject) {
            newRoute.save(function (err) {
              if (err) {
                reject(err);
              }
            });

            resolve();
          }));
        }
      });

      Promise.all(promises)
        .then(function (newRoutes) {
          callback(null, newRoutes);
        })
        .catch(function (err) {
          callback(err);
        });

    }],
    findRoles: [function (callback) {

      // Find roles.
      strapi.orm
        .collections
        .role
        .find()
        .exec(function (err, roles) {
          if (err) {
            callback(err);
          } else {
            callback(null, roles);
          }
        });
    }]
  }, function cb(err, results) {
    if (err) {
      deferred.reject(err);
    } else {
      deferred.resolve(results);
    }
  });

  return deferred.promise;
};
