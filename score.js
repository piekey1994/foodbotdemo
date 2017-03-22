//用户打分

var sqlite3 = require('sqlite3').verbose();  
var db = new sqlite3.Database('test.db');
var Promise = require('bluebird');

exports.setScore=(uid,fid,score)=>{
    return new Promise(
        (resolve,reject)=>{
            db.all('select * from score where uid=? and fid=?',[uid,fid],function(err,res){  
                    if(!err) 
                    {
                        if(res.length==0)
                        {
                            db.run('INSERT INTO score(uid, fid,score) VALUES (?,?,?)',[uid,fid,score],function(err){  
                                if(err)
                                {
                                    console.log("err");
                                    reject(err);  
                                }
                                else
                                {
                                    resolve(score);
                                }
                                    
                            });
                        }
                            
                        else
                        {
                            db.run('UPDATE score SET score=? where uid=? and fid=?',[score,uid,fid],function(err){  
                                if(err)
                                {
                                    console.log("err");
                                    reject(err);  
                                }
                                else
                                {
                                    resolve(score);
                                }
                                    
                            });
                        }
                    }                   
                    else  
                        reject(err);  
                });  
        });
};
