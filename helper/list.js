const delegate = require('func-delegate');
const U = require('../lib/utils');
const _ = require('lodash');

// 统计符合条件的条目数
const getTotal = (Model, opt, ignoreTotal, callback) => {
  if (ignoreTotal) return callback();
  return U.callback(Model.count(opt), callback);
};

/**
 * 获取资源列表的通用方法
 * Model Sequlize 定义的Model，表明数据从哪里获取
 * opt 是否要去req.hooks上去options
 * allowAttrs 那些字段是被允许的
 * hook 默认为空，如果指定了hook，则数据不直接输出而是先挂在 hook上
 * _options 同时使用 findAllOpts生成条件，和手动传入条件。  
 */
const list = (Model, opt, allowAttrs, hook, _options) => (
  (req, res, next) => {
    const params = req.params;
    const options = opt ? req.hooks[opt] : U.findAllOpts(Model, req.params);
    const countOpt = {};
    // 同时使用 findAllOpts生成条件，和手动传入条件。 
    if (_options) {
      if (_options.order) options.order = options.order.concat(_options.order);
      if (_options.where) options.where = Object.assign({}, options.where, _options.where);
    }
    if (options.where) countOpt.where = options.where;
    // 增加判定，是否引入include进行count
    if (req.params.count_include && options.include) countOpt.include = options.include;
    // 是否忽略总条目数，这样就可以不需要count了。在某些时候可以
    // 提高查询速度
    const ignoreTotal = req.params._ignoreTotal === 'yes';
    getTotal(Model, countOpt, ignoreTotal, (error, count) => {
      if (error) return next(error);
      if (ignoreTotal || count) {
        return Model.findAll(options).then((result) => {
          let ls = U.listAttrFilter(result, allowAttrs);
          if (!ignoreTotal) res.header('X-Content-Record-Total', count);
          if (params.attrs) {
            ls = U.listAttrFilter(ls, params.attrs.split(','));
          }
          if (hook) {
            req.hooks[hook] = ls;
          } else {
            res.send(ls);
          }
          next();
        }).catch(next);
      }
      res.header('X-Content-Record-Total', 0);
      if (hook) {
        req.hooks[hook] = [];
      } else {
        res.send([]);
      }
      return next();
    });
  }
);

module.exports = (rest) => {
  const Sequelize = rest.Sequelize;

  const schemas = [{
    name: 'Model',
    type: Object,
    message: 'Model must be a class of Sequelize defined',
  }, {
    name: 'opt',
    type: String,
    allowNull: true,
    message: "FindAll option hooks's name, so `opt` must be a string",
  }, {
    name: 'allowAttrs',
    type: Array,
    allowNull: true,
    validate: {
      check(keys, schema, args) {
        const Model = args[0];
        _.each(keys, (v) => {
          if (!_.isString(v)) {
            throw Error('Every item in allowAttrs must be a string.');
          }
          if (!Model.rawAttributes[v]) {
            throw Error(`Attr non-exists: ${v}`);
          }
        });
        return true;
      },
    },
    message: 'Allow return attrs\'s name array',
  }, {
    name: 'hook',
    type: String,
    allowNull: true,
    message: 'Geted list will hook on req.hooks[hook], so `hook` must be a string',
  }];

  return delegate(list, schemas);
};
