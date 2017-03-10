//中文分词，关键词提取
var Promise = require('bluebird');
var bosonnlp = require('bosonnlp');
exports.getkeywords=(text)=>{
    return new Promise(
        (resolve,reject)=>{
            var nlp = new bosonnlp.BosonNLP(process.env.BOSON_KEY);
            nlp.extractKeywords(text, function (data,err) {
                if(err)
                {
                    reject(err);
                }
                else
                {
                    data = JSON.parse(data);
                    var words=[];
                    data[0].forEach(function(word){
                        words.push(word[1]);
                    });
                    resolve(words);
                }
            });
        });
};