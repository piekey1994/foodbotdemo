require('dotenv-extended').load();

var builder = require('botbuilder');
var restify = require('restify');

var tuling=require('./tuling.js');
var user=require('./user.js');
var menu=require('./menu.js');
var fs = require('fs');
var bsnlp=require('./bsnlp.js');
var captionService = require('./caption-service');
var needle = require("needle");
var url = require('url');
var validUrl = require('valid-url');

var tjs=require('./translation-service.js');

var https_options={};
if(process.env.HTTPS==true)
{
    https_options = {
        key: fs.readFileSync('private.key'),
        certificate: fs.readFileSync('certificate.crt')
    };
}

var server = restify.createServer(https_options);
server.listen(process.env.port || 3978, function () {
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

            //var message = '查询菜谱:';

            //session.send(message+foodname);
            session.send("查询菜谱中···");
            // Async search
            menu
                .find(foodname)
                .then((foods) => {
                    // args
                    
                    if(foods.length>0)
                    {
                        session.send('我找到了%d个有关%s的菜谱:', foods.length,foodname);
                        var message = new builder.Message()
                        .attachmentLayout(builder.AttachmentLayout.carousel)
                        .attachments(foods.map(menusAttachment));

                        session.send(message);
                    }
                    else
                    {
                        session.send("因为找到的食谱数量过少，正在进行模糊查找···");
                        bsnlp.getkeywords(foodname)
                        .then(
                            (words)=>{
                                return menu.findToList(words);
                            }
                        )
                        .then(
                            (menus)=>
                            {
                                session.send('找到如下%d个可能类似的菜谱:', menus.length);
                                var message = new builder.Message()
                                    .attachmentLayout(builder.AttachmentLayout.carousel)
                                    .attachments(menus.map(menusAttachment));

                                session.send(message);
                            }
                        )
                        .catch((error) => {
                            console.error(error);
                            session.send(error);
                        });
                    }
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
        if (hasImageAttachment(session)) {
            var stream = getImageStreamFromUrl(session.message.attachments[0]);
            captionService
                .getCaptionFromStream(stream)
                .then(caption => {return tjs.translation(caption);})
                .then(caption => handleSuccessResponse(session, caption))
                .catch(error => handleErrorResponse(session, error));
        }
        else if(imageUrl = (parseAnchorTag(session.message.text) || (validUrl.isUri(session.message.text)? session.message.text : null))) {
            captionService
                .getCaptionFromUrl(imageUrl)
                .then(caption => {return tjs.translation(caption);})
                .then(caption => handleSuccessResponse(session, caption))
                .catch(error => handleErrorResponse(session, error));
        }
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
                session.send('你好 %s!很高兴见到你', session.userData.profile.name);
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

/**
 * Gets the href value in an anchor element.
 * Skype transforms raw urls to html. Here we extract the href value from the url
 */
const parseAnchorTag = input => {
    var match = input.match("^<a href=\"([^\"]*)\">[^<]*</a>$");
    if(match && match[1]) {
        return match[1];
    }

    return null;
}

//=========================================================
// Response Handling
//=========================================================
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
