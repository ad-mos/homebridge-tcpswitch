'use strict';

var Service;
var Characteristic;
var net = require('net');
var Mutex = require('async-mutex').Mutex;

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory('homebridge-tcpswitch', 'TcpSwitch', TcpSwitch);
};

class TcpSwitch {
    static client = null;
    static mutex = new Mutex();
    static writeMutex = new Mutex();
    static switchStates = {};
    static reTimeout = null;
    static writeTimeout = null;
    static responseCallback = {};
    constructor (log, config) {
        this.log = log;

        this.name                = config.name || 'LED';
        this.host                = config.host || '192.168.0.109';
        this.port                = config.port || 80;
        this.value               = config.value || 1
        TcpSwitch.switchStates[this.value] = false;
        //
        this.service = new Service.Switch(this.name);
        // this.service = new Service.Lightbulb(this.name);

        this.connect();
        setInterval(async function() {
            await TcpSwitch.mutex.acquire();
            await TcpSwitch.writeMutex.acquire();
            if (TcpSwitch.client !== null) {
                TcpSwitch.client.destroy();
                TcpSwitch.client = null;
            }
            TcpSwitch.writeMutex.release();
            TcpSwitch.mutex.release();
        }, 15 * 60 * 1000);
    }

    async connect() {
        await TcpSwitch.mutex.acquire();
        if (TcpSwitch.client === null) {
            var $this = this;
            // $this.log("Mutex: Locked for connecting");
            // Release after a while if nothing happend
            TcpSwitch.reTimeout = setTimeout(function() {
                // $this.log("Mutex: connection timed out. Releasing connection");
                TcpSwitch.reTimeout = null;
                if (TcpSwitch.client !== null) {
                    TcpSwitch.client.destroy();
                }
                TcpSwitch.mutex.release();
            }, 1000);
            // Connect
            TcpSwitch.client = net.createConnection({
                "port": this.port,
                "host": this.host,
                "noDelay": true,
                "keepAlive": true
            });
            TcpSwitch.client.on('data', function(data) {
                this.log.debug('Received TCP: ' + data);
            });
            TcpSwitch.client.on('close', function() {
                $this.log("Connection closed. Reconnecting...")
                TcpSwitch.client = null;
                setTimeout(function() {
                    $this.connect();
                }, 1000);
            })
        } else {
            TcpSwitch.mutex.release();
        }
    }

    async tcpRequest (value, callback) {
        this.connect();
        await TcpSwitch.writeMutex.acquire();
        TcpSwitch.responseCallback[this.value] = callback;
        // this.log("WriteMutex: Locked for write");
        // var $this = this;
        if (value > 1) {
            TcpSwitch.client.write("ON\n");
        } else {
            TcpSwitch.client.write("OFF\n");
        }
        setTimeout(function() {
            TcpSwitch.writeMutex.release();
            // $this.log("WriteMutex: Released write");
        }, 250);
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
        this.log("Switch triggered: switch (" + this.value + ") to state (" + value + "). currently (" + TcpSwitch.switchStates[this.value] + ")");
        if (value !== TcpSwitch.switchStates[this.value])
            this.tcpRequest(this.value, callback);
        else
            callback(null);
    }

    getOnCharacteristicHandler (callback) {
        callback(null, TcpSwitch.switchStates[this.value]);
    }
}