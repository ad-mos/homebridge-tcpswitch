'use strict';

var Service;
var Characteristic;
var net = require('net');

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
}

TcpSwitch.prototype = {

    tcpRequest: function(host, port, value, callback) {
        var client = new net.Socket();
        client.connect(port, host);
        client.on('data', function(data) {
            console.log(data[0]);
            if (data[0] === 83) {
                setTimeout(function(){
                    var arr = [];
                    if (value < 10)
                        arr = [0x72, 0x30 + value, 0x0a, 0x0a];
                    else
                        arr = [0x72, 0x31, 0x2F + value, 0x0a, 0x0a];
                    client.write(new Uint8Array(arr)); 
                }, 500);
            } else {
                callback(data[1]);
                client.destroy()
            }
        });
    },

    setPowerState: function(targetService, powerState, callback, context) {
        var funcContext = 'fromSetPowerState';
        var payload;

        // Callback safety
        if (context == funcContext) {
            if (callback) {
                callback();
            }

            return;
        }


        this.tcpRequest(this.host, this.port, this.value, function(result) {
            // switchService.getCharacteristic(Characteristic.On).setValue(result&value==0, undefined, 'fromSetPowerState');
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
