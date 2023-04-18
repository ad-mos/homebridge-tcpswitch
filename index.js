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
    constructor (log, config) {
        this.log = log;

        this.name                = config.name || 'TcpSwitch';
        this.host                = config.host;
        this.port                = config.port || 6269;
        this.value               = config.value || 1
        TcpSwitch.switchStates[this.value] = false;
        //
        this.service = new Service.Switch(this.name);
        
        this.connect();
    }

    connect() {
        if (TcpSwitch.client === null) {
            TcpSwitch.mutex.acquire();
            // Release after a while if nothing happend
            TcpSwitch.reTimeout = setTimeout(function() {
                TcpSwitch.reTimeout = null;
                if (TcpSwitch.client !== null) {
                    TcpSwitch.client.destroy();
                }
                TcpSwitch.mutex.release();
            }, 1000);
            // Connect
            var $this = this;
            TcpSwitch.client = net.createConnection({
                "port": this.port, 
                "host": this.host,
                "noDelay": true,
                "keepAlive": true
            });
            TcpSwitch.client.on('data', function(data) {
                if (data[0] == 0x53) {
                    var dataString = data.toString();
                    dataString = dataString.substr(dataString.indexOf("&f")+1);
                    for (var i = 1; i < dataString.length && i < 13; i++){
                        TcpSwitch.switchStates[i] = (dataString[i] == '1');
                    }
                    // Disable auto release
                    clearTimeout(TcpSwitch.reTimeout);
                    setTimeout(function() {
                        TcpSwitch.mutex.release();
                    }, 250);
                } else {
                    var switchValue = data[1] & 0x0F;
                    var switchState = (data[2] & 0x0F) == 0x0e;
                    TcpSwitch.switchStates[switchValue] = switchState;
                    TcpSwitch.responseCallback(null);
                    clearTimeout(TcpSwitch.writeTimeout);
                    TcpSwitch.writeMutex.release();
                }
            });
            TcpSwitch.client.on('close', function() {
                TcpSwitch.client = null;
                $this.connect();
            })
        }
    }

    tcpRequest (value, callback) {
        this.connect();
        TcpSwitch.writeMutex.acquire();
        TcpSwitch.writeTimeout = setTimeout(function() {
            TcpSwitch.writeMutex.release();
        }, 1000);

        TcpSwitch.responseCallback = callback;
        var arr = [];
        if (value < 10)
            arr = [0x72, 0x30 + value, 0x0a, 0x0a];
        else
            arr = [0x72, 0x31, 0x30 + value - 10, 0x0a, 0x0a];
        TcpSwitch.client.write(new Uint8Array(arr));
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
        this.tcpRequest(this.value, callback);        
    }

    getOnCharacteristicHandler (callback) {
        callback(null, TcpSwitch.switchStates[this.value]);
    }
}