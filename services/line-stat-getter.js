'use strict';
var _ = require('lodash');
var P = require('bluebird');
var moment = require('moment');
var OperatorValueParser = require('./operator-value-parser');

// jshint sub: true
function LineStatGetter(model, params, opts) {

  function getGroupByDateInterval() {
    var timeRange = params['time_range'].toLowerCase();
    var column = params['group_by_date_field'];

    if (isMysql()) {
      switch (timeRange) {
        case 'day':
          return [
            opts.sequelize.fn('DATE_FORMAT',
            opts.sequelize.col(column),
            '%Y-%m-%d 00:00:00'),
            'date'
          ];
        case 'week':
          return [
            opts.sequelize.literal('DATE_FORMAT(DATE_SUB(' + column + ', ' +
              'INTERVAL ((7 + WEEKDAY(' + column + ')) % 7) DAY), ' +
              '\'%Y-%m-%d 00:00:00\')'),
            'date'
          ];
        case 'month':
          return [
            opts.sequelize.fn('DATE_FORMAT',
            opts.sequelize.col(column),
            '%Y-%m-01 00:00:00'),
            'date'
          ];
        case 'year':
          return [
            opts.sequelize.fn('DATE_FORMAT',
            opts.sequelize.col(column),
            '%Y-01-01 00:00:00'),
            'date'
          ];
      }
    } else {
      return [
        opts.sequelize.fn('to_char',
          opts.sequelize.fn('date_trunc', params['time_range'],
          opts.sequelize.col(params['group_by_date_field'])),
        'YYYY-MM-DD 00:00:00'),
        'date'
      ];
    }
  }

  function isMysql() {
    return (['mysql', 'mariadb'].indexOf(opts.sequelize.options.dialect) > -1);
  }

  function fillEmptyDateInterval(records) {
    var firstDate = moment(records[0].label);
    var lastDate = moment(records[records.length - 1].label);
    var timeRange = params['time_range'].toLowerCase();

    for (var i = firstDate ; i.toDate() <= lastDate.toDate() ;
      i = i.add(1, timeRange)) {

      var label = i.format('Y-MM-DD 00:00:00');
      if (!_.find(records, { label: label })) {
        records.push({ label: label, values: { value: 0 }});
      }
    }

    return _.sortBy(records, 'label');
  }

  function getAggregate() {
    return [
      opts.sequelize.fn(params.aggregate.toLowerCase(),
      opts.sequelize.col(getAggregateField())),
      'value'
    ];
  }

  function getAggregateField() {
    return params['aggregate_field'] || 'id';
  }

  function getFilters() {
    var filters = {};

    if (params.filters) {
      params.filters.forEach(function (filter) {
        filters[filter.field] = new OperatorValueParser(opts).perform(model,
          filter.field, filter.value);
      });
    }

    return filters;
  }

  function getTimeRangeFormat() {
    var timeRange = params['time_range'].toLowerCase();

    switch (timeRange) {
      case 'month':
        return '%Y-%m-01';
    }
  }

  this.perform = function () {

    return model.findAll({
      attributes: [getGroupByDateInterval(), getAggregate()],
      where: getFilters(),
      group: ['date'],
      order: ['date']
    })
    .then(function (records) {
      return P.map(records, function (record) {
        record = record.toJSON();

        return {
          label: record.date,
          values: { value: parseInt(record.value) }
        };
      });
    })
    .then(function (records) {
      return { value: fillEmptyDateInterval(records) };
    });
  };
}

module.exports = LineStatGetter;
