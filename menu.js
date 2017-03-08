var sqlite3 = require('sqlite3').verbose();  
var db = new sqlite3.Database('test.db');
var Promise = require('bluebird');

exports.find=(foodname)=>{
    return new Promise(
        (resolve,reject)=>{
            db.all("select * from food where name like ? order by hot desc limit 0,10",'%'+foodname+'%',function(err,res){  
                    if(!err) 
                    {
                        resolve(res);
                    }                   
                    else  
                        reject(err);  
                });
        });
};