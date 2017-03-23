//基于用户的协调过滤算法
var sqlite3 = require('sqlite3').verbose();  
var db = new sqlite3.Database('test.db');
var Promise = require('bluebird');
var async=require('async');


//查找和当前用户有交集的所有用户
function findOther(uid)
{
    return new Promise(
        (resolve,reject)=>{
            db.all("select uid from score where fid in (select fid from score where uid=?) group by uid",uid,function(err,res){  
                    if(!err) 
                    {
                        resolve(res);
                    }                   
                    else  
                    {
                        reject(err); 
                    }
                });
        });
}

//根据用户列表构建一个评分字典
function createDict(uids)
{
    return new Promise(
        (resolve,reject)=>{
            async.map(
                uids,
                function(item,callback){
                    uid=item['uid'];
                    db.all("select fid,score from score where uid=?",uid,function(err,res){  
                        if(!err) 
                        {
                            food2Score=new Object();
                            for(i=0;i<res.length;i++)
                            {
                                food2Score[res[i][fid]]=res[i][score];
                            }
                            callback(null,[String(uid),food2Score]);
                        }                   
                        else  
                        {
                            callback(err,null);
                        }
                    });
                },
                function(err,res){
                    for(i=0;i<err.length;i++)
                    {
                        if(err[i]) reject(err);
                    }
                    dict=new Object();
                    for(i=0;i<res.length;i++)
                    {
                        dict[res[i][0]]=res[i][1];
                    }
                    resolve(dict);
                });
        });
}

//求和
Array.prototype.sum = function (){
 return this.reduce(function (partial, value){
  return partial + value;
 })
};
Array.prototype.pow = function(){
    newArray=[];
    for(var item in this)
    {
        newArray.push(Math.pow(item,2));
    }
    return newArray;
};

//皮尔逊距离
function sim_pearson(dict, p1, p2)
{
    si=[];
    for(var item in dict[p1]) 
    {
        if(item in dict[p2])
        {
            si.push(item);
        }
    }
    n=si.length;
    if(n==0) return 1;

    list1=[];
    list2=[];
    for(var item in si)
    {
        list1.push(dict[p1][item]);
        list2.push(dict[p2][item]);
    }

    sum1=list1.sum();
    sum2=list2.sum();

    sum1Sq=list1.pow().sum();
    sum2Sq=list2.pow().sum();

    plist=[];
    for(var item in si)
    {
        plist.push(dict[p1][item]*dict[p2][item]);
    }
    pSum=plist.sum();

    num=pSum - (sum1*sum2/n);
    den = Math.sqrt((sum1Sq - Math.pow(sum1, 2)/n) * (sum2Sq - Math.pow(sum2, 2)/n));
    if(den==0) return 0;

    r=num/den;

    return r;

}

//获取协同过滤排序结果
exports.getRecommendedItems=(uid)=>{
    return new Promise(
        (resolve,reject)=>{
            findOther(uid)
            .then((uids)=>{return createDict(uids)})
            .then((dict)=>{

            })
            .catch((error) => {
                reject(error);
            });
        });
};