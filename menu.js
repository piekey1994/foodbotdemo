//查找菜单

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

exports.findToList=(keywords)=>{
    return new Promise(
        (resolve,reject)=>{
            var menus=[];
            var maxlength=keywords.length;
            var i=0;
            function findMenu(foodname)
            {
                db.all("select * from food where name like ? order by hot desc limit 0,10",'%'+foodname+'%',function(err,res)
                {
                    if(!err)
                    {
                        menus=menus.concat(res);
                        i++;
                        if(menus.length<10 && i<maxlength)
                        {
                            findMenu(keywords[i]);
                        }
                        else
                        {
                            resolve(menus);
                        }
                    }
                    else
                    {
                        reject(err);
                    }
                });
            }
            findMenu(keywords[i]);
        });
};
