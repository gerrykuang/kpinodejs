var request = require('request');

request('http://10.41.241.164:8080/users ', function (error, response, body) {

    if (!error && response.statusCode == 200) {
       
        body = JSON.parse(body);
        console.log(body)

    }
})
