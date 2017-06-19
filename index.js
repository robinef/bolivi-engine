var express = require('express');
var app = express();
var cfenv = require("cfenv")
var appEnv = cfenv.getAppEnv()
var mysql = require('mysql');
var https = require('https');
var appEnv = cfenv.getAppEnv()
const services = appEnv.getServices();
var schedule = require('node-schedule');
//Connection settings
var connection;
var db_config = {
    host     : '',
    user     : '',
    password : '',
    database : ''
};

/**
 * Handle MySQL disconnect
 */
function handleDisconnect() {
  connection = mysql.createConnection(db_config); // Recreate the connection, since
                                                  // the old one cannot be reused.
  connection.connect(function(err) {              // The server is either down
    if(err) {                                     // or restarting (takes a while sometimes).
      console.log('error when connecting to db:', err);
      setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
    }                                     // to avoid a hot loop, and to allow our node script to
  });                                     // process asynchronous requests in the meantime.
                                          // If you're also serving http, display a 503 error.
  connection.on('error', function(err) {
    console.log('db error', err);
    if(err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
      handleDisconnect();                         // lost due to either server restart, or a
    } else {                                      // connnection idle timeout (the wait_timeout
      throw err;                                  // server variable configures this)
    }
  });
}

handleDisconnect();
// Loop every 5 seconds to ask for new content
var j = schedule.scheduleJob('*/10 * * * * *', function(){
  console.log('The answer to life, the universe, and everything!');
  // Request user registered keyword
  connection.query('SELECT * FROM crowdtangle_preferences', function (error, results) {
  if (error) {
    // If error don't do anything
  } else {
    // Loop on results and request CT API's
    for(var i = 0; i < results.length; i++){
      console.log(results[i].user_bot_id);
      var userBotId = results[i].user_bot_id;
      var searchPref = results[i].search_preference;
      var updateId = results[i].id;
      //+Anonymosue function with context
      (function(userBotId, searchPref, updateId){
            https.get('https://api.crowdtangle.com/posts/search?types=live_video,live_video_complete&startDate=2017-06-10&sortBy=total_interactions&token=XXXXX&searchTerm='+searchPref, function(response) {
            // Continuously update stream with data
            var body = '';
            response.on('data', function(d) {
                body += d;
            });
            response.on('end', function() {
              // Data reception is done, do whatever with it!
              var parsed = JSON.parse(body);
              // If something is in the result 
              if(typeof parsed.result !== 'undefined' &&
                parsed.result.posts.length > 0 &&     
                typeof parsed.result.posts[0].link !== 'undefined') {
                  console.log("Sending to " + userBotId + " based on preference " + searchPref + ' get '+parsed );
                    //creating response 
                    connection.query('insert crowdtangle_response  ( ct_id , content_date , link  , user_bot_id ,    user_pref_id )  values  ('+parsed.result.posts[0].id+', "'+parsed.result.posts[0].date+'", "'+parsed.result.posts[0].link+'" , '+userBotId+',"'+updateId+'" )', function (error, results) {
                    if (error) {
                      //If constraints raised, means that video is already sent so don't act
                      console.log(error);
                    } else {
                        //new video to send to user
                        sendMessageToBot(userBotId, parsed.result.posts[0].link);
                        //updating response to not spam the user
                        connection.query('update crowdtangle_response set response_done  = true where user_bot_id = '+userBotId+' and link ="'+parsed.result.posts[0].link+'"', function (error, results) {
                        if (error) {
                          console.log(error);
                        }
                      });
                    }
                 });

              } else {
                console.log("FAIIIILLLL !!")
              }
            });
        });
      })(userBotId, searchPref, updateId)
   }
  }
  });
});

/**
 * Send Message to Bot
 * 
 * @param {*} recipientId 
 * @param {*} parsedUrl 
 */
function sendMessageToBot(recipientId, parsedUrl) {

var request = require("request");
// Make request to FB bot to send video to user
var options = { method: 'POST',
  url: 'https://graph.facebook.com/v2.9/me/messages',
  qs: { access_token: 'XXXXX' },
  headers: 
   {
     'cache-control': 'no-cache',
     'content-type': 'application/json' },
  body: 
   { recipient: { id: recipientId },
     message: 
      { attachment: 
         { type: 'template',
           payload: 
            { template_type: 'open_graph',
              elements: [ { url: parsedUrl } ] } } } },
  json: true };
  request(options, function (error, response, body) {
    if (error) throw new Error(error);
  });
}

//Start Cloud Foundry application
app.listen( process.env.PORT || 4000)
