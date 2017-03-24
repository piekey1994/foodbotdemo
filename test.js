require('dotenv-extended').load();
var cf=require('./userbasedCF.js');
var foodModel=require('./menu.js');

uid=3;
cf.getRecommendedItems(uid)
.then(result => {return foodModel.findMoreFood(result);})
.then(res => console.log(res))
.catch(err=>console.error(err));