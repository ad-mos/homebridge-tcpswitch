'use strict';

var Service;
var Characteristic;
var net = require('net');
var clients = {};
var responseCallback = function() {};
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
        var clientKey = this.host + ":" + this.port;
        if (clientKey in clients)
            this.client = clients[clientKey];
        else {
            this.client = clients[clientKey] = new net.Socket();
            this.client.connect(this.port, this.host);
            this.client.on('data', function(data) {
                console.log(data.toString());
                console.log(data);
                if (data[0] == 0x53) {
                    dataString = data.toString();
                    dataString = dataString.substr(dataString.indexOf("&f")+1);
                    for (var i = 1; i < dataString.length && i < 13; i++){
                        switchStates[i] = (dataString[i] == '1');
                    }
                } else {
                    responseCallback(data);
                }
            });
        }

        this.service = new Service.Switch(this.name);
    }
    tcpRequest (value, callback) {
        responseCallback = callback
        try {
            var arr = [];
            if (value < 10)
                arr = [0x72, 0x30 + value, 0x0a, 0x0a];
            else
                arr = [0x72, 0x31, 0x2F + value, 0x0a, 0x0a];
            this.client.write(new Uint8Array(arr)); 
        } catch (error) {
            this.client.connect(this.port, this.host);
        }
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
            console.log("setting " + switchValue + " to " + switchState);
            console.log(switchStates);
            callback(null);
        });
    }

    getOnCharacteristicHandler (callback) {
        callback(null, switchStates[this.value]);
    }
}