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
            var $this = this;
            $this.log("Mutex: Locked for connecting");
            TcpSwitch.mutex.acquire();
            // Release after a while if nothing happend
            TcpSwitch.reTimeout = setTimeout(function() {
                $this.log("Mutex: connection timed out. Releasing connection");
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
                if (data[0] == 0x53) {
                    $this.log("Initial message received.");
                    var dataString = data.toString();
                    dataString = dataString.substr(dataString.indexOf("&f")+1);
                    for (var i = 1; i < dataString.length && i < 13; i++){
                        TcpSwitch.switchStates[i] = (dataString[i] == '1');
                    }
                    // Disable auto release
                    clearTimeout(TcpSwitch.reTimeout);
                    setTimeout(function() {
                        $this.log("Mutex: Released connecting");
                        TcpSwitch.mutex.release();
                    }, 250);
                } else {
                    var switchValue = data[1] & 0x0F;
                    var switchState = (data[2] & 0x0F) == 0x0e;
                    TcpSwitch.switchStates[switchValue] = switchState;
                    if (switchValue in TcpSwitch.responseCallback)
                        TcpSwitch.responseCallback[switchValue](null);
                    // clearTimeout(TcpSwitch.writeTimeout);
                    // $this.log("WriteMutex: data received. releasing write lock");
                    // TcpSwitch.writeMutex.release();
                }
            });
            TcpSwitch.client.on('close', function() {
                $this.log("Connection closed. Reconnecting...")
                TcpSwitch.client = null;
                $this.connect();
            })
        }
    }

    tcpRequest (value, callback) {
        this.connect();
        TcpSwitch.writeMutex.acquire();
        TcpSwitch.responseCallback[this.value] = callback;
        this.log("WriteMutex: Locked for write");
        var $this = this;
        // TcpSwitch.writeTimeout = setTimeout(function() {
        //     $this.log("WriteMutex: Write timed out. releasing write lock");
        //     TcpSwitch.responseCallback[$this.value](-1);
        //     TcpSwitch.writeMutex.release();
        // }, 10000);

        var arr = [];
        if (value < 10)
            arr = [0x72, 0x30 + value, 0x0a, 0x0a];
        else
            arr = [0x72, 0x31, 0x30 + value - 10, 0x0a, 0x0a];
        TcpSwitch.client.write(new Uint8Array(arr));
        setTimeout(function() { 
            TcpSwitch.writeMutex.release();
            $this.log("WriteMutex: Released write");
        }, 500);
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
        this.tcpRequest(this.value, callback);        
    }

    getOnCharacteristicHandler (callback) {
        callback(null, TcpSwitch.switchStates[this.value]);
    }
}