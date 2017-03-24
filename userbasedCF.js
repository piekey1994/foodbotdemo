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
                    db.all("select fid,score from score where uid=?",item['uid'],function(err,res){  
                        if(!err) 
                        {
                            food2Score=new Object();
                            for(i=0;i<res.length;i++)
                            {
                                food2Score[res[i]["fid"]]=res[i]["score"];
                            }
                            //console.log(String(uid),food2Score);
                            callback(null,[String(item['uid']),food2Score]);
                        }                   
                        else  
                        {
                            callback(err,null);
                        }
                    });
                },
                function(err,res){
                    if(err) reject(err);
                    else
                    {
                        dict=new Object();
                        for(i=0;i<res.length;i++)
                        {
                            //console.log(res[i][0],res[i][1]);
                            dict[res[i][0]]=res[i][1];
                        }
                        resolve(dict);
                    }
                    
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
    for(i=0;i<this.length;i++)
    {
        newArray.push(Math.pow(this[i],2));
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
    for(i=0;i<si.length;i++)
    {
        item=si[i];
        //console.log('item',item);
        list1.push(dict[p1][item]);
        list2.push(dict[p2][item]);
    }
    //console.log(list1,list2);
    sum1=list1.sum();
    sum2=list2.sum();
    
    sum1Sq=list1.pow().sum();
    sum2Sq=list2.pow().sum();

    plist=[];
    for(i=0;i<si.length;i++)
    {
        item=si[i];
        plist.push(dict[p1][item]*dict[p2][item]);
    }
    pSum=plist.sum();

    //console.log(sum1,sum2,sum1Sq,sum2Sq,pSum);
    num=pSum - (sum1*sum2/n);
    den = Math.sqrt((sum1Sq - Math.pow(sum1, 2)/n) * (sum2Sq - Math.pow(sum2, 2)/n));
    if(den==0) return 0;

    r=num/den;
    //console.log(p1,p2,num,den);
    return r;

}

//获取协同过滤排序结果
exports.getRecommendedItems=(uid)=>{
    return new Promise(
        (resolve,reject)=>{
            findOther(uid)
            .then((uids)=>{return createDict(uids)})
            .then((dict)=>{
                console.log(dict);
                person=String(uid);
                totals=new Object();
                simSums=new Object();
                for(var other in dict)
                {
                    if(other==person) continue;
                    sim=sim_pearson(dict,person,other)
                    if(sim<=0) continue;
                    for(var item in dict[other])
                    {
                        if(!(item in dict[person]))
                        {
                            totals[item]=0;
                            totals[item] += sim * dict[other][item];
                            simSums[item]=0;
                            simSums[item] += sim;
                        }
                    }
                }
                //console.log(totals);
                rankings = [];
                for (var item in totals)
                {
                    newItem=new Object();
                    newItem['id']=item;
                    newItem['score']=totals[item];
                    newItem['result']='和你口味相似的用户也喜欢吃，该食物和你的皮尔逊距离为'+newItem['score'];
                    rankings.push(newItem);
                }
                rankings.sort(function(a,b){
                    return b.score-a.score});
                resolve(rankings.slice(0,10));
            })
            .catch((error) => {
                reject(error);
            });
        });
};