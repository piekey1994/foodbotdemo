require('dotenv-extended').load();//环境变量文件.env载入

var builder = require('botbuilder');//微软聊天机器人框架
var restify = require('restify');//restful服务器模块
var fs = require('fs');//文件处理模块
var needle = require("needle");//轻量级的http client模块
var url = require('url');//url转义
var validUrl = require('valid-url');//url验证

var tuling=require('./tuling.js');//图灵机器人api
var userModel=require('./user.js');//用户model
var foodModel=require('./menu.js');//菜单model
var bsnlp=require('./bsnlp.js');//柏森的自然语言处理api
var captionService = require('./caption-service');//微软的图像认知api
var tjs=require('./translation-service.js');//文本翻译api
var scoreModel=require('./score.js');//分数mofel
var recommendation=require('./recommendation.js');//协同过滤推荐模块
var titleModel=require('./title.js');//分类模块

titleModel.initTitle();


//如果服务器需要开启https则载入相关密钥
var https_options={};
if(process.env.HTTPS==true)
{
    https_options = {
        key: fs.readFileSync('private.key'),
        certificate: fs.readFileSync('certificate.crt')
    };
}



//开启3978端口的restful服务
var server = restify.createServer(https_options);
server.listen(process.env.port || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

//创建聊天机器人
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

//第一次连接该聊天机器人时自动的信息
bot.on('conversationUpdate', function (activity) {
    if (activity.membersAdded) {
        activity.membersAdded.forEach(function (identity) {
            if (identity.id === activity.address.bot.id) {
                var reply = new builder.Message()
                    .address(activity.address)
                    .text("我是美食机器人小胖，可以帮你查菜谱，也可以推荐一些菜给你试试。");
                bot.send(reply);
            }
        });
    }
});


//luis api引入
const LuisModelUrl = process.env.LUIS_MODEL_URL;
var recognizer = new builder.LuisRecognizer(LuisModelUrl);
//luis解析过程
var intents = new builder.IntentDialog({ recognizers: [recognizer] })
    .matches('查询菜谱', [
        function (session, args, next) {
            var foodnameEntity = builder.EntityRecognizer.findEntity(args.entities, '菜名');
            if (foodnameEntity) {
                next({ response: foodnameEntity.entity });
            } else {
                builder.Prompts.text(session, '请告诉我菜名');
            }
        },
        function (session, results) {
            var foodname = results.response;
            //敏感词过滤
            if(!checkFoodName(foodname))
            {
                session.send("食用"+foodname+"是违法行为，请遵循相关法律规定，拒绝食用保护动物。");
                return;
            }
            session.send("查询菜谱中···");
            //异步查询
            foodModel
                .find(foodname)
                .then((foods) => {
                    if(foods.length>0)
                    {
                        session.send('我找到了%d个有关%s的菜谱:', foods.length,foodname);
                        //将结果映射为卡片输出
                        var message = new builder.Message()
                        .attachmentLayout(builder.AttachmentLayout.carousel)
                        .attachments(foods.map(menusAttachment));
                        session.send(message);
                    }
                    else
                    {
                        session.send("因为找到的食谱数量过少，正在进行模糊查找···");
                        //通过柏森api将foodname进行关键词分割并根据重要程度排序
                        bsnlp.getkeywords(foodname)
                        .then(
                            (words)=>{
                                //异步获取相关的菜谱列表
                                return foodModel.findToList(words);
                            }
                        )
                        .then(
                            (menus)=>
                            {
                                if(menus.length>0)
                                {
                                    session.send('找到如下%d个可能类似的菜谱:', menus.length);
                                    var message = new builder.Message()
                                        .attachmentLayout(builder.AttachmentLayout.carousel)
                                        .attachments(menus.map(menusAttachment));
                                    session.send(message);
                                }
                                else
                                {
                                    session.send("很抱歉，没找到任何相关菜谱");
                                }
                            }
                        )
                        .catch((error) => {
                            console.error(error);
                            session.send(error);
                        });
                    }
                }).catch((error) => {
                    console.error(error);
                    session.send(error);
                });
        
        }
    ])
    .matches('菜谱推荐', [
        function (session) {
            builder.Prompts.choice(session,"我是擅长饮食健康的机器人，你需要特别定制的推荐吗",["人群膳食","疾病调理","功能性调理","脏腑调理","不需要"]);
        },
        function (session, results ){
            require=results.response.entity;
            if(require=="不需要")
            {
                foods=[];
                session.send("正在为您推荐一些新鲜菜品...");
                recommendation.userbasedCF(session.userData.profile.id)
                .then(res=>{return foodModel.findMoreFood(res);})
                .then(menus=>{
                    if(menus.length<10)
                    {
                        foods=menus;
                        return recommendation.tastebased(session.userData.profile.id);
                    }
                }
                )
                .then(menus=>{
                    if(menus)
                    {
                        foods=foods.concat(menus);
                    }
                    if(foods.length>0)
                    {
                        foods=foods.slice(0,10);
                        var message = new builder.Message()
                            .attachmentLayout(builder.AttachmentLayout.carousel)
                            .attachments(foods.map(menusAttachment));
                        session.send(message);
                    }
                    else
                    {
                        session.send("很抱歉，没找到什么适合您吃的菜，建议您多为一些菜品打分");
                    }
                    session.endDialog();
                }).catch((error) => {
                    console.error(error);
                    session.send(error);
                });
            }
            else
            {
                builder.Prompts.choice(session,"你可以查询相关的饮食推荐",titleModel.title[require]);
            }
        },
        function (session, results ){
            label=results.response.entity;
            recommendation.labelbased(label,session.userData.profile.id)
            .then(menus=>{
                    var message = new builder.Message()
                            .attachmentLayout(builder.AttachmentLayout.carousel)
                            .attachments(menus.map(menusAttachment));
                    session.send(message);
            }).catch((error) => {
                console.error(error);
                session.send(error);
            });
        }
    ])
    .matches('退出登录',(session, args) => {
        session.userData.profile=undefined;
        session.send("您的账号退出成功，欢迎下次再找我玩。");
        session.endDialog();
        session.beginDialog('/');
    })
    .matches('打分',(session, args) => {
        var resArray=session.message.text.split(' ');
        var score=Number(resArray[1]);
        var fid=resArray[3];
        var id=Number(session.userData.profile.id);
        scoreModel.setScore(id,fid,score)
        .then(s=>{session.send("记录成功");})
        .catch((error) => {
                console.error(error);
                session.send(error);
            });  
    })
    //如果匹配不到任何情境则进入闲聊模式
    .onDefault((session) => {
        //如果用户提交的信息中含有图片
        if (hasImageAttachment(session)) {
            var stream = getImageStreamFromUrl(session.message.attachments[0]);
            //通过微软的认知api获取图片意义
            captionService
                .getCaptionFromStream(stream)
                .then(caption => {return tjs.translation(caption);})//将图意翻译成中文
                .then(caption => handleSuccessResponse(session, caption))//返回给用户
                .catch(error => handleErrorResponse(session, error));
        }
        //如果用户提交的时一个链接，则尝试从其中获取图片
        else if(imageUrl = (parseAnchorTag(session.message.text) || (validUrl.isUri(session.message.text)? session.message.text : null))) {
            captionService
                .getCaptionFromUrl(imageUrl)
                .then(caption => {return tjs.translation(caption);})
                .then(caption => handleSuccessResponse(session, caption))
                .catch(error => handleErrorResponse(session, error));
        }
        //否则调用图灵机器人api进行闲聊
        else {
            tuling.Talk(session.message.text,session.userData.profile.id)
            .then(text => {
                session.send(text);
            })
            .catch((error) => {
                console.error(error);
                session.send(error);
            });  
        }
    });


//默认聊天场景
bot.dialog('/', [
        function (session) {
            //console.log(session.userData.profile);
            //如果用户还没有登录的话
            if(session.userData.profile==undefined || session.userData.profile=={})
            {
                //跳转到登录场景
                session.beginDialog('/sign');                
            }
            else
            {
                //跳转到luis场景
                session.send("欢迎回来，%s。请讲",session.userData.profile.name);
                session.beginDialog('/luis');
            }
                
        },
        function (session, results) {
            //登录成功后跳转到luis场景
            if(typeof(results.response)=="object")
            {
                session.userData.profile = results.response;
                session.send('你好 %s!很高兴见到你', session.userData.profile.name);
            }
            session.beginDialog('/luis');

        }
    ]);
//luis聊天场景
bot.dialog('/luis',intents);
//登录场景
bot.dialog('/sign', [
    function (session, args, next) {
            session.dialogData.profile = {};
            builder.Prompts.text(session, "你叫什么名字呀?");
        },
        function (session, results, next) {
            if (results.response) {
                session.dialogData.profile.name = results.response;
            }
            builder.Prompts.text(session, "你的密码是什么呀？如果你是第一次来会自动帮你注册的");
        },
        function (session, results) {
            if (results.response) {
                session.dialogData.profile.password = results.response;
            }
            userModel.check(session.dialogData.profile.name,session.dialogData.profile.password)
            .then(result=>{
                if(result)
                {
                    return userModel.login(session.dialogData.profile.name,session.dialogData.profile.password);
                }
                else
                {
                    return userModel.register(session.dialogData.profile.name,session.dialogData.profile.password)
                }
            })
            .then(
                id=>{
                    session.dialogData.profile.id=id;
                    console.log(id);
                    session.endDialogWithResult({ response: session.dialogData.profile });
                }
            )
            .catch((error) => {
                console.error(error);
                session.dialogData.profile=undefined;
                session.endDialogWithResult({ response: session.dialogData.profile })
            });  
        }
]);


//检测非法词汇
function checkFoodName(foodname){
    dangerword=['熊掌','猴脑','熊胆','穿山甲'];
    for(i=0;i<dangerword.length;i++)
    {
        if(foodname.indexOf(dangerword[i])>=0) return false;
    }
    return true;

}

// 菜单卡片
function menusAttachment(food) {
    var card= new builder.ThumbnailCard()
        .title(food.name)
        .subtitle('时间：%s 工艺：%s 口味：%s', food.usetime, food.technology, food.taste)
        .images([new builder.CardImage().url(food.img)])
        .buttons([
            new builder.CardAction()
                .title('详细步骤')
                .type('openUrl')
                .value(food.href),
            new builder.CardAction()
                .title('非常喜欢')
                .type('postBack')
                .value("分数 3 编号 "+food.id),
            new builder.CardAction()
                .title('还可以')
                .type('postBack')
                .value("分数 2 编号 "+food.id),
            new builder.CardAction()
                .title('讨厌')
                .type('postBack')
                .value("分数 1 编号 "+food.id)
        ]);
    if(food.result!=undefined)
    {
        card.text("推荐理由："+food.result);
    }
    return card;
}



//=========================================================
// 图像语义识别
//=========================================================
const hasImageAttachment = session => {
    return ((session.message.attachments.length > 0) && (session.message.attachments[0].contentType.indexOf("image") !== -1));
}

const getImageStreamFromUrl = attachment => {
    var headers = {};
    if (isSkypeAttachment(attachment)) {
        // The Skype attachment URLs are secured by JwtToken,
        // you should set the JwtToken of your bot as the authorization header for the GET request your bot initiates to fetch the image.
        // https://github.com/Microsoft/BotBuilder/issues/662
        connector.getAccessToken((error, token) => {
            var tok = token;
            headers['Authorization'] = 'Bearer ' + token;
            headers['Content-Type'] = 'application/octet-stream';

            return needle.get(attachment.contentUrl, { headers: headers });
        });
    }

    headers['Content-Type'] = attachment.contentType;
    return needle.get(attachment.contentUrl, { headers: headers });
}

const isSkypeAttachment = attachment => {
    if (url.parse(attachment.contentUrl).hostname.substr(-"skype.com".length) == "skype.com") {
        return true;
    }
    return false;
}

const parseAnchorTag = input => {
    var match = input.match("^<a href=\"([^\"]*)\">[^<]*</a>$");
    if(match && match[1]) {
        return match[1];
    }

    return null;
}

const handleSuccessResponse = (session, caption) => {
    if (caption) {
        session.send("我觉得它是" + caption);
    }
    else {
        session.send("对不起，我不知道这是什么东西");
    }

}

const handleErrorResponse = (session, error) => {
    session.send("图片识别服务出错");
    console.error(error);
}


