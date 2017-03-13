var tjs = require('translation.js')
tjs.add(new tjs.BaiDu())

exports.translation=(text)=>{
    return new Promise(
        (resolve,reject)=>{
            tjs
            .translate({ api: 'BaiDu', text: text })
            .then(function (resultObj) {
                resolve(resultObj.result[0])
            }, function (errMsg) {
                reject(errMsg)
            })
        });
};

