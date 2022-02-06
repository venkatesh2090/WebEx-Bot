//Webex Bot Starter - featuring the webex-node-bot-framework - https://www.npmjs.com/package/webex-node-bot-framework

var framework = require('webex-node-bot-framework');
var webhook = require('webex-node-bot-framework/webhook');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser.json());
app.use(express.static('images'));
const config = require("./config.json");
const moment = require("moment");
const axios = require('axios');

const bookingCommand = /book (\b[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}\b) (\d{4}\-\d{2}-\d{2})$/
const registerCommand = /register (\b[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}\b)$/
const listEventsCommand = 'event list'

/**
 * Flow
 * 1. organiser -> bot book
 * 2. bot replies with confirmation and display name
 * 3. organiser -> bot confirm
 */


// init framework
var framework = new framework(config);
framework.start();
console.log("Starting framework, please wait...");

framework.on("initialized", function () {
  console.log("framework is all fired up! [Press CTRL-C to quit]");
});

// A spawn event is generated when the framework finds a space with your bot in it
// If actorId is set, it means that user has just added your bot to a new space
// If not, the framework has discovered your bot in an existing space
framework.on('spawn', (bot, id, actorId) => {
  if (!actorId) {
    // don't say anything here or your bot's spaces will get
    // spammed every time your server is restarted
    console.log(`While starting up, the framework found our bot in a space called: ${bot.room.title}`);
  } else {
    // When actorId is present it means someone added your bot got added to a new space
    // Lets find out more about them..
    var msg = 'You can say `help` to get the list of words I am able to respond to.';
    bot.webex.people.get(actorId).then((user) => {
      msg = `Hello there ${user.displayName}. ${msg}`; 
    }).catch((e) => {
      console.error(`Failed to lookup user details in framwork.on("spawn"): ${e.message}`);
      msg = `Hello there. ${msg}`;  
    }).finally(() => {
      // Say hello, and tell users what you do!
      if (bot.isDirect) {
        bot.say('markdown', msg);
      } else {
        let botName = bot.person.displayName;
        msg += `\n\nDon't forget, in order for me to see your messages in this group space, be sure to *@mention* ${botName}.`;
        bot.say('markdown', msg);
      }
    });
  }
});


//Process incoming messages

let responded = false;
/* On mention with command
ex User enters @botname help, the bot will write back in markdown
*/
framework.hears(/help|what can i (do|say)|what (can|do) you do/i, function (bot, trigger) {
  console.log(`someone needs help! They asked ${trigger.text}`);
  responded = true;
  bot.say(`Hello ${trigger.person.displayName}.`)
    .then(() => sendHelp(bot))
    .catch((e) => console.error(`Problem in help hander: ${e.message}`));
});

/* On mention with command, using other trigger data, can use lite markdown formatting
ex User enters @botname 'info' phrase, the bot will provide personal details
*/
framework.hears('info', function (bot, trigger) {
  console.log("info command received");
  responded = true;
  //the "trigger" parameter gives you access to data about the user who entered the command
  let personAvatar = trigger.person.avatar;
  let personEmail = trigger.person.emails[0];
  let personDisplayName = trigger.person.displayName;
  let outputString = `Here is your personal information: \n\n\n **Name:** ${personDisplayName}  \n\n\n **Email:** ${personEmail} \n\n\n **Avatar URL:** ${personAvatar}`;
  bot.say("markdown", outputString);
});

function isDateValid(date) {
  let m = moment(date, 'YYYY-MM-DD');
  return m.isValid();
}

framework.hears(bookingCommand, async function(bot, trigger) {
  responded = true;
  let isValid = true;
  const splitText = trigger.message.text.split(' ');
  const date = splitText[3];
  const organisation = splitText[2];
  const person = trigger.person;
  const room = bot.room.id;
  if (!isDateValid(date)) {
    isValid = false;
    bot.say('markdown', `date ${date} is not valid`)
      .catch(e => console.error("Failed to say book"));
  }
  const data = {
    organisation,
    organiser: {
      id: person.id,
      emails: person.emails,
      name: person.displayName
    },
    date,
    room
  }
  console.log(data)
  if (isValid) {
    try {
      const res = await axios({
        method: 'PUT',
        url: 'https://blooming-savannah-87825.herokuapp.com/event',
        data 
      });
      const { event_id, registration_id } = res.data
      bot.say('markdown', `event id for registration: ${event_id}
      registration_id for organiser: ${registration_id}`)
        .catch(e => console.error('failed to say book'));
    } catch(err) {
      console.error(err);
      console.error("There was an error processing axios req")
      bot.say('markdown', 'error while processing request')
    }
  }
})

framework.hears(listEventsCommand, async function (bot, trigger) {
  responded = true;
  console.log('here')
  const room = bot.room.id;
  try {
    const res = await axios({
      method: 'GET',
      url: `https://blooming-savannah-87825.herokuapp.com/event/${room}`
    })
    const events = res.data.events;
    let msg = 'events\n';
    for(let i = 0; i < events.length; i++) {
      const e = events[i];
      msg += `${i+1} **id**: ${e.id} **organisation**: ${e.organisation}
      `;
    }
    bot.say('markdown', msg)
      .catch(err => console.error("error while processing event list"))
  } catch(err) {
    console.error(err);
    bot.say('markdown', 'error while processing request');
    console.error("Error processing request")
  }
})

framework.hears(registerCommand, async function(bot, trigger) {
  responded = true;
  const event = trigger.message.text.split(' ')[2];
  const person = trigger.person.id;
  try {
    const res = await axios({
      method: 'POST',
      url: "https://blooming-savannah-87825.herokuapp.com/register",
      data: {
        event,
        person
      }
    });
    if (res.status == 200) {
      bot.say("markdown", `Registered user with registration id
      ${person}`)
        .catch(err => console.error("Error when reploying"));
    } else if (res.status == 200) {
      bot.say("markdown", "A registration already exists with you")
        .catch(err => console.error("Error when replying"))
    } else {
      bot.say("markdown", "Error: Unknow response")
        .catch(error => console.error("Error when replying"))
    }
  } catch(err) {
    console.error(err);
    bot.say("markdown", "Error while requesting")
  }
})

/* On mention with unexpected bot command
   Its a good practice is to gracefully handle unexpected input
*/
framework.hears(/.*/, function (bot, trigger) {
  // This will fire for any input so only respond if we haven't already
  if (!responded) {
    console.log(`catch-all handler fired for user input: ${trigger.text}`);
    bot.say(`Sorry, I don't know how to respond to "${trigger.text}"`)
      .then(() => sendHelp(bot))
      .catch((e) => console.error(`Problem in the unexepected command hander: ${e.message}`));
  }
  responded = false;
});

/**
 * TODO: Add our own command list
 * 1. book ${eventOrganisation} ${date:yyyy/mm/dd} ${time?}
 * 2. h-elp
 * 
 * Backlog
 * - search 10 matching eventOrganisation given readable name
 * @param {*} bot  bot
 */
function sendHelp(bot) {
  bot.say("markdown", 'These are the commands I can respond to:', '\n\n ' +
    '1. **book** organisation_id date   (learn more about the Webex Bot Framework) \n' +
    '2. **register** registration_id  (get your personal details) \n' +
    '3. **help** (what you are reading now)');
}


//Server config & housekeeping
// Health Check
app.get('/', function (req, res) {
  res.send(`I'm alive.`);
});

app.post('/', webhook(framework));

var server = app.listen(config.port, function () {
  framework.debug('framework listening on port %s', config.port);
});

// gracefully shutdown (ctrl-c)
process.on('SIGINT', function () {
  framework.debug('stoppping...');
  server.close();
  framework.stop().then(function () {
    process.exit();
  });
});
