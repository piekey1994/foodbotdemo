//用户注册登录

var sqlite3 = require('sqlite3').verbose();  
var db = new sqlite3.Database('test.db');
var Promise = require('bluebird');

exports.register=(name,password)=>{
    return new Promise(
        (resolve,reject)=>{
            
            db.run('INSERT INTO user(name, password) VALUES (?,?)',[name,password],function(err){  
                    if(err)
                    {
                        console.log("err");
                        reject(err);  
                    }
                    else
                    {
                        console.log("insert");
                        resolve(this.lastID);
                    }
                        
                });
        });
};

exports.check=(name,password)=>{
    return new Promise(
        (resolve,reject)=>{
            db.all('select * from user where name=? and password=?',[name,password],function(err,res){  
                    if(!err) 
                    {
                        if(res.length==0)
                        {
                            console.log(res.length);
                            resolve(false);
                        }
                            
                        else
                        {
                            console.log("true");
                            resolve(true);
                        }
                    }                   
                    else  
                        reject(err);  
                });  
        });
};

exports.login=(name,password)=>{
    return new Promise(
        (resolve,reject)=>{
            db.get('select * from user where name=? and password=?',[name,password],function(err,res){  
                    if(err)
                        reject(err);  
                    else
                        resolve(res.id);
                });
        });
};