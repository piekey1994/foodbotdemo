var request=require('request');
var Promise = require('bluebird');

exports.Talk=(text,id)=>{
    return new Promise(
        (resolve,reject)=>{
            if(text){
                const requestData={
                    url: "http://openapi.tuling123.com/openapi/api/v2",
                    body: {
                        "perception": {
                            "inputText": {
                                "text": text
                            }
                        },
                        "userInfo": {
                            "apiKey": process.env.TULING_APIKEY,
                            "userId": id
                        }
                    },
                    json: true
                };
                request.post(requestData,(error,response,body)=>{
                    if(error){
                        reject(error);
                    }
                    else if(response.statusCode!=200){
                        reject(body);
                    }
                    else{
                        resolve(body.results[0].values.text);
                    }
                });
            }
            else{
                resolve("我好像听不懂 “"+text+"” 是什么意思。");
            }
        }
    );
}