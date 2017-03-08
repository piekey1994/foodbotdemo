require('dotenv-extended').load();

var builder = require('botbuilder');
var restify = require('restify');

var sqlite3 = require('sqlite3').verbose();  
var db = new sqlite3.Database('test.db');

var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
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



const LuisModelUrl = process.env.LUIS_MODEL_URL ||
    'https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/6f5d85fb-a19e-454d-a288-c02e5eb2d5ef?subscription-key=069d0ceab83b424ab25bb1c9ad9f4bba&verbose=true';

// Main dialog with LUIS
var recognizer = new builder.LuisRecognizer(LuisModelUrl);
var intents = new builder.IntentDialog({ recognizers: [recognizer] })
    .matches('查询菜谱', [
        function (session, args, next) {
            session.send('Welcome to the Hotels finder! we are analyzing your message: \'%s\'', session.message.text);

            // try extracting entities
            var cityEntity = builder.EntityRecognizer.findEntity(args.entities, 'builtin.geography.city');
            var airportEntity = builder.EntityRecognizer.findEntity(args.entities, 'AirportCode');
            if (cityEntity) {
                // city entity detected, continue to next step
                session.dialogData.searchType = 'city';
                next({ response: cityEntity.entity });
            } else if (airportEntity) {
                // airport entity detected, continue to next step
                session.dialogData.searchType = 'airport';
                next({ response: airportEntity.entity });
            } else {
                // no entities detected, ask user for a destination
                builder.Prompts.text(session, 'Please enter your destination');
            }
        },
        function (session, results) {
            var destination = results.response;

            var message = 'Looking for hotels';
            if (session.dialogData.searchType === 'airport') {
                message += ' near %s airport...';
            } else {
                message += ' in %s...';
            }

            session.send(message, destination);

            // Async search
            Store
                .searchHotels(destination)
                .then((hotels) => {
                    // args
                    session.send('I found %d hotels:', hotels.length);

                    var message = new builder.Message()
                        .attachmentLayout(builder.AttachmentLayout.carousel)
                        .attachments(hotels.map(hotelAsAttachment));

                    session.send(message);

                    // End
                    session.endDialog();
                });
        }
    ])
    .matches('菜谱推荐', (session, args) => {
        // retrieve hotel name from matched entities
        var hotelEntity = builder.EntityRecognizer.findEntity(args.entities, 'Hotel');
        if (hotelEntity) {
            session.send('Looking for reviews of \'%s\'...', hotelEntity.entity);
            Store.searchHotelReviews(hotelEntity.entity)
                .then((reviews) => {
                    var message = new builder.Message()
                        .attachmentLayout(builder.AttachmentLayout.carousel)
                        .attachments(reviews.map(reviewAsAttachment));
                    session.send(message)
                });
        }
    })
    .onBegin([
        function (session) {
            session.beginDialog('/sign', session.userData.profile);
        },
        function (session, results) {
            session.userData.profile = results.profile;
            session.send('你好 %s!我想死你啦', session.userData.profile.name);
        }
    ])
    .onDefault((session) => {
        session.send('我好像听不懂 “%s” 是什么意思。', session.message.text);
    });

if (process.env.IS_SPELL_CORRECTION_ENABLED == "true") {
    bot.use({
        botbuilder: function (session, next) {
            spellService
                .getCorrectedText(session.message.text)
                .then(text => {
                    session.message.text = text;
                    next();
                })
                .catch((error) => {
                    console.error(error);
                    next();
                });
        }
    })
}

bot.dialog('/', intents);

bot.dialog('/sign', [
    function (session, args, next) {
            session.dialogData.profile = args || {};
            if (!args.profile.name) {
                builder.Prompts.text(session, "你叫什么名字呀?");
            } else {
                next();
            }
        },
        function (session, results, next) {
            if (results.response) {
                session.dialogData.profile.name = results.response;
            }
            if (!args.profile.password) {
                builder.Prompts.text(session, "你的密码是什么呀？如果你是第一次来会自动帮你注册的");
            } else {
                next();
            }
        },
        function (session, results) {
            if (results.response) {
                session.dialogData.profile.password = results.response;
            }

            session.endDialogWithResults({ repsonse: session.dialogData.profile })
        }
]);

// Helpers
function hotelAsAttachment(hotel) {
    return new builder.HeroCard()
        .title(hotel.name)
        .subtitle('%d stars. %d reviews. From $%d per night.', hotel.rating, hotel.numberOfReviews, hotel.priceStarting)
        .images([new builder.CardImage().url(hotel.image)])
        .buttons([
            new builder.CardAction()
                .title('More details')
                .type('openUrl')
                .value('https://www.bing.com/search?q=hotels+in+' + encodeURIComponent(hotel.location))
        ]);
}

function reviewAsAttachment(review) {
    return new builder.ThumbnailCard()
        .title(review.title)
        .text(review.text)
        .images([new builder.CardImage().url(review.image)])
}