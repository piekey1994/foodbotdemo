require('dotenv-extended').load();
var menu=require('./menu.js');
var bsnlp=require('./bsnlp.js');

foodname="蚂蚁下树";
bsnlp.getkeywords(foodname)
.then(
    (words)=>{
        return menu.findToList(words);
    }
)
.then(
    (menus)=>
    {
        console.log(menus);
    }
)
.catch((error) => {
    console.error(error);
});