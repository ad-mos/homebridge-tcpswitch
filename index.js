'use strict';

var Service;
var Characteristic;
var net = require('net');
var switchStates = {};


module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory('homebridge-tcpswitch', 'TcpSwitch', TcpSwitch);
};

class TcpSwitch {
    constructor (log, config) {
        this.log = log;

        this.name                = config.name || 'TcpSwitch';
        this.host                = config.host;
        this.port                = config.port || 6269;
        this.value               = config.value || 1
        switchStates[this.value] = false;
        //
        this.service = new Service.Switch(this.name);

        setInterval(function() {
            var statusClient = net.createConnection({
                "port": config.port, 
                "host": config.host,
                "noDelay": true
            });
            statusClient.on('data', function(data) {
                if (data[0] == 0x53) {
                    var dataString = data.toString();
                    dataString = dataString.substr(dataString.indexOf("&f")+1);
                    for (var i = 1; i < dataString.length && i < 13; i++){
                        switchStates[i] = (dataString[i] == '1');
                    }
                    statusClient.destroy();
                }
            });    
        }, 1 * 60 * 1000);
    }

    tcpRequest (value, callback) {
        var client = net.createConnection({
            "port": this.port, 
            "host": this.host,
            "noDelay": true
        });
        client.on('data', function(data) {
            if (data[0] == 0x53) {
                var dataString = data.toString();
                dataString = dataString.substr(dataString.indexOf("&f")+1);
                for (var i = 1; i < dataString.length && i < 13; i++){
                    switchStates[i] = (dataString[i] == '1');
                }
                setTimeout(function() {
                    var arr = [];
                    if (value < 10)
                        arr = [0x72, 0x30 + value, 0x0a, 0x0a];
                    else
                        arr = [0x72, 0x31, 0x30 + value - 10, 0x0a, 0x0a];
                    var result = client.write(new Uint8Array(arr));
                }, 250);
            } else {
                client.destroy();
                callback(data);
            }
        });
    }

    getServices () {
        const informationService = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Manufacturer, 'TcpSwitch')
            .setCharacteristic(Characteristic.Model, 'TcpSwitch');

        this.service.getCharacteristic(Characteristic.On)
            .on('get', this.getOnCharacteristicHandler.bind(this))
            .on('set', this.setOnCharacteristicHandler.bind(this));

        return [informationService, this.service];
    }

    setOnCharacteristicHandler (value, callback) {
        this.tcpRequest(this.value, function(result){
            var switchValue = result[1] & 0x0F;
            var switchState = (result[2] & 0x0F) == 0x0e;
            switchStates[switchValue] = switchState;
            callback(null);
        });
    }

    getOnCharacteristicHandler (callback) {
        callback(null, switchStates[this.value]);
    }
}