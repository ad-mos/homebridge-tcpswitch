'use strict';

var Service;
var Characteristic;
var net = require('net');
var clients = {};
var responseCallback = function() {};

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory('homebridge-tcpswitch', 'TcpSwitch', TcpSwitch);
};

function TcpSwitch(log, config) {
    this.log = log;

    this.name            = config.name || 'TcpSwitch';
    this.host            = config.host;
    this.port            = config.port || 6269;
    this.value           = config.value || 1
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
            responseCallback(data);
        });
    }
}

TcpSwitch.prototype = {

    tcpRequest: function(host, port, value, callback) {
        responseCallback = callback
        try {
            var arr = [];
            if (value < 10)
                arr = [0x72, 0x30 + value, 0x0a, 0x0a];
            else
                arr = [0x72, 0x31, 0x2F + value, 0x0a, 0x0a];
            this.client.write(new Uint8Array(arr)); 
        } catch (error) {
            this.client.connect(port, host);
        }
    },

    setPowerState: function(targetService, powerState, callback, context) {
        var funcContext = 'fromSetPowerState';
        // Callback safety
        if (context == funcContext) {
            if (callback) {
                callback();
            }
            return;
        }

        this.tcpRequest(this.host, this.port, this.value, function(result) {
            console.log("====");
            console.log(this.value);
            console.log(result);
            console.log("====");
            var switchValue = result[1] & 0x0F;
            var switchStatus = result[2] & 0x0F == 0x0e;
            console.log(switchValue);
            console.log(switchStatus);
            console.log(targetService);
            console.log('----');
            targetService.getCharacteristic(Characteristic.On).setValue(switchStatus, undefined, funcContext);
        }.bind(this));
    },

    identify: function (callback) {
        this.log('Identify me Senpai!');
        callback();
    },

    getServices: function () {
        this.services = [];

        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'TcpSwitch')
            .setCharacteristic(Characteristic.Model, 'TcpSwitch');
        this.services.push(informationService);

        var switchService = new Service.Switch(this.name);
        switchService
            .getCharacteristic(Characteristic.On)
            .on('set', this.setPowerState.bind(this, switchService));

        this.services.push(switchService);

        return this.services;
    }
};
