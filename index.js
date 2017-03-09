require('dotenv-extended').load();

var builder = require('botbuilder');
var restify = require('restify');

var tuling=require('./tuling.js');
var user=require('./user.js');
var menu=require('./menu.js');
var fs = require('fs');

var https_options = {
  key: fs.readFileSync('private.pem'),
  certificate: fs.readFileSync('file.crt')
};

var server = restify.createServer(https_options);
server.listen(443, function () {
    console.log('%s listening to %s', server.name, server.url);
});

// Create chat bot
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

bot.on('conversationUpdate', function (activity) {
    // when user joins conversation, send instructions
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



const LuisModelUrl = process.env.LUIS_MODEL_URL;
var recognizer = new builder.LuisRecognizer(LuisModelUrl);
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

            var message = '查询菜谱:';

            session.send(message+foodname);

            // Async search
            menu
                .find(foodname)
                .then((foods) => {
                    // args
                    session.send('我找到了%d个有关%s的菜谱:', foods.length,foodname);

                    var message = new builder.Message()
                        .attachmentLayout(builder.AttachmentLayout.carousel)
                        .attachments(foods.map(menusAttachment));

                    session.send(message);
                    //session.endDialog();
                }).catch((error) => {
                    console.error(error);
                    session.send(error);
                });
        }
    ])
    .matches('菜谱推荐', (session, args) => {
        session.send("功能未实现");
    })
    .onDefault((session) => {
        tuling.Talk(session.message.text,session.userData.profile.id)
        .then(text => {
             session.send(text);
        })
        .catch((error) => {
            console.error(error);
            session.send(error);
        });  
    });


bot.dialog('/', [
        function (session) {
            console.log(session.userData.profile);
            if(session.userData.profile==undefined || session.userData.profile=={})
            {
                session.beginDialog('/sign');                
            }
            else
            {
                session.send("欢迎回来，%s。请讲",session.userData.profile.name);
                session.beginDialog('/luis');
            }
                
        },
        function (session, results) {
            if(typeof(results.response)=="object")
            {
                session.userData.profile = results.response;
                session.send('你好 %s!我想死你啦', session.userData.profile.name);
            }
            session.beginDialog('/luis',results);

        }
    ]);

bot.dialog('/luis',intents);

bot.dialog('/sign', [
    function (session, args, next) {
            session.dialogData.profile = {};
            // if (!args.profile.name) {
            //     builder.Prompts.text(session, "你叫什么名字呀?");
            // } else {
            //     next();
            // }
            builder.Prompts.text(session, "你叫什么名字呀?");
        },
        function (session, results, next) {
            if (results.response) {
                session.dialogData.profile.name = results.response;
            }
            builder.Prompts.text(session, "你的密码是什么呀？如果你是第一次来会自动帮你注册的");
            // if (!args.profile.password) {
            //     builder.Prompts.text(session, "你的密码是什么呀？如果你是第一次来会自动帮你注册的");
            // } else {
            //     next();
            // }
        },
        function (session, results) {
            if (results.response) {
                session.dialogData.profile.password = results.response;
            }
            //session.endDialogWithResult({ repsonse: session.dialogData.profile });
            user.check(session.dialogData.profile.name,session.dialogData.profile.password)
            .then(result=>{
                if(result)
                {
                    return user.login(session.dialogData.profile.name,session.dialogData.profile.password);
                }
                else
                {
                    return user.register(session.dialogData.profile.name,session.dialogData.profile.password)
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

// 菜单卡片
function menusAttachment(food) {
    return new builder.HeroCard()
        .title(food.name)
        .subtitle('时间：%s 工艺：%s 口味：%s', food.usetime, food.technology, food.taste)
        .images([new builder.CardImage().url(food.img)])
        .buttons([
            new builder.CardAction()
                .title('详细步骤')
                .type('openUrl')
                .value(food.href)
        ]);
}