//读取类别

var sqlite3 = require('sqlite3').verbose();  
var db = new sqlite3.Database('test.db');
var Promise = require('bluebird');

var title=new Object();

exports.initTitle=()=>{
    db.all("select * from title",function(err,res){  
        if(err) console.log(err)
        else
        {
            for(i=0;i<res.length;i++)
            {
                type=res[i]['type'];
                label=res[i]['label'];
                if(title[type]==undefined) title[type]=[];
                title[type].push(label);
            }
            //console.log(title);
        }
    })
};

exports.title=title;