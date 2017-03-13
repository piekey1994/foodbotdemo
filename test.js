require('dotenv-extended').load();
var tjs=require('./translation-service.js');

foodname="an apple";
tjs.translationByGoogle(foodname)
.then(result => console.log(result))
.catch(err=>console.error(err));