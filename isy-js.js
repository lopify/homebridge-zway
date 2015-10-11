var types = require("HAP-NodeJS/accessories/types.js");
var isy = require('isy-js');
var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var inherits = require('util').inherits;

var deviceMap = {};

function ISYChangeHandler(isy,device) {
	var deviceToUpdate = deviceMap[device.address];
	if(deviceToUpdate != null) {
		deviceToUpdate.handleExternalChange();
	}
}

////////////////////////////////////////////////////////////////////////////////////////////////
// PLATFORM

function ISYPlatform(log,config) {
	this.log = log;
	this.config = config;
	this.host = config.host;
	this.username = config.username;
	this.password = config.password;
	this.elkEnabled = config.elkEnabled;
	this.isy = new isy.ISY(this.host, this.username,this.password, config.elkEnabled, ISYChangeHandler);
}

ISYPlatform.prototype.shouldIgnore = function(device) {
	var deviceAddress = device.address;
	var deviceName = device.name;		
	for(var index = 0; index < this.config.ignoreDevices.length; index++) {
		var rule = this.config.ignoreDevices[index];
		if(rule.nameContains != "") {
			if(deviceName.indexOf(rule.nameContains) == -1) {
				continue;
			}
		}
		if(rule.lastAddressDigit != "") {
			if(deviceAddress.indexOf(rule.lastAddressDigit,deviceAddress.length-2) == -1) {
				continue;
			}
		}
		if(rule.address != "") {
			if(deviceAddress != rule.address) {
				continue;
			} 
		}
		console.log("@@@@@@ Ignoring device: "+deviceName+" ["+deviceAddress+"] because of rule ["+rule.nameContains+"] ["+rule.lastAddressDigit+"] ["+rule.address+"]");						
		return true;

	}
	return false;	
}

ISYPlatform.prototype.accessories = function(callback) {
	var that = this;
	this.isy.initialize(function() {
		var results = [];		
		var deviceList = that.isy.getDeviceList();
		for(var index = 0; index < deviceList.length; index++) {
			var device = deviceList[index];
			var homeKitDevice = null;
			if(!that.shouldIgnore(device)) {
				
				if(device.deviceType == that.isy.DEVICE_TYPE_LIGHT || device.deviceType == that.isy.DEVICE_TYPE_DIMMABLE_LIGHT) {
					homeKitDevice = new ISYLightAccessory(that.log,device);
				} else if(device.deviceType == that.isy.DEVICE_TYPE_LOCK || device.deviceType == that.isy.DEVICE_TYPE_SECURE_LOCK) {
					homeKitDevice = new ISYLockAccessory(that.log,device);
				} else if(device.deviceType == that.isy.DEVICE_TYPE_OUTLET) {
					homeKitDevice = new ISYOutletAccessory(that.log,device);
				} else if(device.deviceType == that.isy.DEVICE_TYPE_FAN) {
					homeKitDevice = new ISYFanAccessory(that.log,device);
				} else if(device.deviceType == that.isy.DEVICE_TYPE_DOOR_WINDOW_SENSOR) {
					homeKitDevice = new ISYDoorWindowSensorAccessory(that.log,device);
				} else if(device.deviceType == that.isy.DEVICE_TYPE_ALARM_DOOR_WINDOW_SENSOR) {
					homeKitDevice = new ISYDoorWindowSensorAccessory(that.log,device);
				} else if(device.deviceType == that.isy.DEVICE_TYPE_ALARM_PANEL) {
					homeKitDevice = new ISYElkAlarmPanelAccessory(that.log,device);
				}
				if(homeKitDevice != null) {
					deviceMap[device.address] = homeKitDevice;
					results.push(homeKitDevice);
				}
			}
		}
		if(that.isy.elkEnabled) {
			var panelDevice = that.isy.getElkAlarmPanel();
			var panelDeviceHK = new ISYElkAlarmPanelAccessory(that.log,panelDevice);
			deviceMap[panelDevice.address] = panelDeviceHK;
			results.push(panelDeviceHK);
		}
		console.log("Filtered device has: "+results.length+" devices");
		callback(results);		
	});
}

/////////////////////////////////////////////////////////////////////////////////////////////////
// FANS

function ISYFanAccessory(log,device) {
	this.log = log;
	this.device = device;
	this.address = device.address;
	this.name = device.name;
}

ISYFanAccessory.prototype.identify = function(callback) {
	// Do the identify action
	callback();
}

ISYFanAccessory.prototype.translateFanSpeedToHK = function(fanSpeed) {
	if(fanSpeed == "Off") {
		return 0;
	} else if(fanSpeed == "Low") {
		return 32;
	} else if(fanSpeed == "Medium") {
		return 67;
	} else if(fanSpeed == "High") {
		return 100;
	} else {
		this.log("!!!! ERROR: Unknown fan speed: "+fanSpeed);
		return 0;
	}
}

ISYFanAccessory.prototype.translateHKToFanSpeed = function(fanStateHK) {
	if(fanStateHK == 0) {
		return "Off";
	} else if(fanStateHK > 0 && fanStateHK <=32) {
		return "Low";
	} else if(fanStateHK > 33 && fanStateHK <= 67) {
		return "Medium";
	} else if(fanStateHK > 67) {
		return "High";
	} else {
		this.log("!!!!! ERROR: Unknown fan state!");
		return "Off";
	}
}

ISYFanAccessory.prototype.getFanRotationSpeed = function(callback) {
	callback(null,this.translateFanSpeedToHK(this.device.getCurrentFanState()));
}

ISYFanAccessory.prototype.setFanRotationSpeed = function(fanStateHK,callback) {
	var newFanState = this.translateHKToFanSpeed(fanStateHK);
	this.log("Sending command to set fan state to: "+newFanState);
	if(newFanState != this.device.getCurrentFanState()) {
		this.device.sendFanCommand(newFanState, function(result) {
			callback();		
		});
	} else {
		this.log("Fan command does not change actual speed");
		callback();
	}
}


ISYFanAccessory.prototype.getIsFanOn = function() {
	return (this.device.getCurrentFanState() != "Off");
}

ISYFanAccessory.prototype.getFanOnState = function(callback) {
	callback(null,this.getIsFanOn());
}

ISYFanAccessory.prototype.setFanOnState = function(onState,callback) {
	if(onState != this.getIsFanOn()) {
		if(onState) {
			this.setFanRotationSpeed(this.translateFanSpeedToHK("Medium"), callback);
		} else {
			this.setFanRotationSpeed(this.translateFanSpeedToHK("Off"), callback);
		}
	} else {
		this.log("Fan command does not change actual state");
		callback();
	} 
}


ISYFanAccessory.prototype.handleExternalChange = function() {
	this.fanService
		.setCharacteristic(Characteristic.On, this.getIsFanOn());
		
	this.fanService
		.setCharacteristic(Characteristic.RotationSpeed, this.translateFanSpeedToHK(this.device.getCurrentFanState()));		
}

ISYFanAccessory.prototype.getServices = function() {
	var informationService = new Service.AccessoryInformation();
	
	informationService
      .setCharacteristic(Characteristic.Manufacturer, "SmartHome")
      .setCharacteristic(Characteristic.Model, this.device.deviceFriendlyName)
      .setCharacteristic(Characteristic.SerialNumber, this.device.address);	
	  
	var fanService = new Service.Fan();
	
	this.fanService = fanService;
	this.informationService = informationService;	
    
    fanService
      .getCharacteristic(Characteristic.On)
      .on('set', this.setFanOnState.bind(this));
	  
	fanService
	  .getCharacteristic(Characteristic.On)
	  .on('get', this.getFanOnState.bind(this));
	  
	fanService
	  .addCharacteristic(new Characteristic.RotationSpeed())
	  .on('get', this.getFanRotationSpeed.bind(this));	  
  
	fanService
	  .getCharacteristic(Characteristic.RotationSpeed)	
	  .on('set', this.setFanRotationSpeed.bind(this));	
    
    return [informationService, fanService];	
}

/////////////////////////////////////////////////////////////////////////////////////////////////
// OUTLETS

function ISYOutletAccessory(log,device) {
	this.log = log;	
	this.device = device;
	this.address = device.address;
	this.name = device.name;
}

ISYOutletAccessory.prototype.identify = function(callback) {
	// Do the identify action
	callback();
}

ISYOutletAccessory.prototype.setOutletState = function(outletState,callback) {
	this.log("Sending command to set outlet state to: "+outletState);
	if(outletState != this.device.getCurrentOutletState()) {
		this.device.sendOutletCommand(outletState, function(result) {
			callback();		
		});
	} else {
		callback();
	}
}

ISYOutletAccessory.prototype.getOutletState = function(callback) {
	callback(null,this.device.getCurrentOutletState());
}

ISYOutletAccessory.prototype.getOutletInUseState = function(callback) {
	callback(null, true);
}

ISYOutletAccessory.prototype.handleExternalChange = function() {
	this.outletService
		.setCharacteristic(Characteristic.On, this.device.getCurrentOutletState());
}

ISYOutletAccessory.prototype.getServices = function() {
	var informationService = new Service.AccessoryInformation();
	
	informationService
      .setCharacteristic(Characteristic.Manufacturer, "SmartHome")
      .setCharacteristic(Characteristic.Model, this.device.deviceFriendlyName)
      .setCharacteristic(Characteristic.SerialNumber, this.device.address);	
	  
	var outletService = new Service.Outlet();
	
	this.outletService = outletService;
	this.informationService = informationService;	
    
    outletService
      .getCharacteristic(Characteristic.On)
      .on('set', this.setOutletState.bind(this));
	  
	outletService
	  .getCharacteristic(Characteristic.On)
	  .on('get', this.getOutletState.bind(this));
	  
	outletService
	  .getCharacteristic(Characteristic.OutletInUse)
	  .on('get', this.getOutletInUseState.bind(this));
    
    return [informationService, outletService];	
}

/////////////////////////////////////////////////////////////////////////////////////////////////
// LOCKS

function ISYLockAccessory(log,device) {
	this.log = log;	
	this.device = device;
	this.address = device.address;
	this.name = device.name;
}

ISYLockAccessory.prototype.identify = function(callback) {
	callback();
}

ISYLockAccessory.prototype.setTargetLockState = function(lockState,callback) {
	this.log("Sending command to set lock state to: "+lockState);
	if(lockState != this.getDeviceCurrentStateAsHK()) {
		var targetLockValue = (lockState == 0) ? false : true;
		this.device.sendLockCommand(targetLockValue, function(result) {
			callback();		
		});
	} else {
		callback();
	}
}

ISYLockAccessory.prototype.getDeviceCurrentStateAsHK = function() {
	return (this.device.getCurrentLockState() ? 1 : 0);
}

ISYLockAccessory.prototype.getLockCurrentState = function(callback) {
	callback(null, this.getDeviceCurrentStateAsHK());
}

ISYLockAccessory.prototype.getTargetLockState = function(callback) {
	this.getLockCurrentState(callback);
}

ISYLockAccessory.prototype.handleExternalChange = function() {
	this.lockService
		.setCharacteristic(Characteristic.LockTargetState, this.getDeviceCurrentStateAsHK());
	this.lockService
		.setCharacteristic(Characteristic.LockCurrentState, this.getDeviceCurrentStateAsHK());
}

ISYLockAccessory.prototype.getServices = function() {
	var informationService = new Service.AccessoryInformation();
	
	informationService
      .setCharacteristic(Characteristic.Manufacturer, "SmartHome")
      .setCharacteristic(Characteristic.Model, this.device.deviceFriendlyName)
      .setCharacteristic(Characteristic.SerialNumber, this.device.address);	
	  
	var lockMechanismService = new Service.LockMechanism();
	
	this.lockService = lockMechanismService;
	this.informationService = informationService;	
    
    lockMechanismService
      .getCharacteristic(Characteristic.LockTargetState)
      .on('set', this.setTargetLockState.bind(this));
	  
	lockMechanismService
	  .getCharacteristic(Characteristic.LockTargetState)
	  .on('get', this.getTargetLockState.bind(this));
	  
	lockMechanismService
	  .getCharacteristic(Characteristic.LockCurrentState)
	  .on('get', this.getLockCurrentState.bind(this));
    
    return [informationService, lockMechanismService];	
}

////////////////////////////////////////////////////////////////////////////////////////////////////////
// LIGHTS

function ISYLightAccessory(log,device) {
	this.log = log;	
	this.device = device;
	this.address = device.address;
	this.name = device.name;
	this.dimmable = (this.device.deviceType == "DimmableLight");
}

ISYLightAccessory.prototype.identify = function(callback) {
	this.device.sendLightCommand(true, function(result) {
		this.device.sendLightCommand(false, function(result) {
			callback();			
		});		
	});
}

ISYLightAccessory.prototype.setPowerState = function(powerOn,callback) {
	this.log("=== Setting powerstate to %s", powerOn);
	if(powerOn != this.device.getCurrentLightState()) {
		this.log("+++ Changing powerstate to "+powerOn);
		this.device.sendLightCommand(powerOn, function(result) {
			callback();
		});
	} else {
		this.log("--- Ignoring redundant setPowerState");
		callback();
	}
}

ISYLightAccessory.prototype.handleExternalChange = function() {
	this.log("=== Handling external change for light");
	this.lightService
		.setCharacteristic(Characteristic.On, this.device.getCurrentLightState());
	if(this.device.deviceType == this.device.isy.DEVICE_TYPE_DIMMABLE_LIGHT) {
		this.lightService
			.setCharacteristic(Characteristic.Brightness, this.device.getCurrentLightDimState()	);
	}
}

ISYLightAccessory.prototype.getPowerState = function(callback) { 
	callback(null,this.device.getCurrentLightState());
}

ISYLightAccessory.prototype.setBrightness = function(level,callback) {
	this.log("Setting brightness to %s", level);
	if(level != this.device.getCurrentLightDimState()) {
		this.log("+++ Changing Brightness to "+level);
		this.device.sendLightDimCommand(level, function(result) {
			callback();			
		});
	} else {
		this.log("--- Ignoring redundant setBrightness");
		callback();
	}
}

ISYLightAccessory.prototype.getBrightness = function(callback) {
	callback(null,this.device.getCurrentLightDimState());
}

ISYLightAccessory.prototype.getServices = function() {
	var informationService = new Service.AccessoryInformation();
	
	informationService
      .setCharacteristic(Characteristic.Manufacturer, "SmartHome")
      .setCharacteristic(Characteristic.Model, this.device.deviceFriendlyName)
      .setCharacteristic(Characteristic.SerialNumber, this.device.address);	
	  
	var lightBulbService = new Service.Lightbulb();
	
	this.informationService = informationService;
	this.lightService = lightBulbService; 	
	
    lightBulbService
      .getCharacteristic(Characteristic.On)
      .on('set', this.setPowerState.bind(this));
	  
	lightBulbService
	  .getCharacteristic(Characteristic.On)
	  .on('get', this.getPowerState.bind(this));
	  
	if(this.dimmable) {
		lightBulbService
		.addCharacteristic(new Characteristic.Brightness())
		.on('get', this.getBrightness.bind(this));
		
		lightBulbService
		.getCharacteristic(Characteristic.Brightness)	  
		.on('set', this.setBrightness.bind(this));
	}
	  
    return [informationService, lightBulbService];	
}

/////////////////////////////////////////////////////////////////////////////////////////////////
// CONTACT SENSOR

function ISYDoorWindowSensorAccessory(log,device) {
	this.log = log;	
	this.device = device;
	this.address = device.address;
	this.name = device.name;
	this.doorWindowState = false;
}

ISYDoorWindowSensorAccessory.prototype.identify = function(callback) {
	// Do the identify action
	callback();
}

ISYDoorWindowSensorAccessory.prototype.translateCurrentDoorWindowState = function() {
	return (this.device.getCurrentDoorWindowState()) ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED;	
}

ISYDoorWindowSensorAccessory.prototype.getCurrentDoorWindowState = function(callback) {
	callback(null,this.translateCurrentDoorWindowState());
}

ISYDoorWindowSensorAccessory.prototype.handleExternalChange = function() {
	this.sensorService
		.setCharacteristic(Characteristic.ContactSensorState, this.translateCurrentDoorWindowState());
}

ISYDoorWindowSensorAccessory.prototype.getServices = function() {
	var informationService = new Service.AccessoryInformation();
	
	informationService
      .setCharacteristic(Characteristic.Manufacturer, "SmartHome")
      .setCharacteristic(Characteristic.Model, this.device.deviceFriendlyName)
      .setCharacteristic(Characteristic.SerialNumber, this.device.address);	
	  
	var sensorService = new Service.ContactSensor();
	
	this.sensorService = sensorService;
	this.informationService = informationService;	
    
    sensorService
      .getCharacteristic(Characteristic.ContactSensorState)
      .on('get', this.getCurrentDoorWindowState.bind(this));
    
    return [informationService, sensorService];	
}

/////////////////////////////////////////////////////////////////////////////////////////////////
// ELK SENSOR PANEL

function ISYElkAlarmPanelAccessory(log,device) {
	this.log = log;	
	this.device = device;
	this.address = device.address;
	this.name = device.name;
}

ISYElkAlarmPanelAccessory.prototype.identify = function(callback) {
	callback();
}

ISYElkAlarmPanelAccessory.prototype.setAlarmTargetState = function(targetStateHK,callback) {
	this.log("Sending command to set alarm panel state to: "+targetStateHK);
	var targetState = this.translateHKToAlarmTargetState(targetState);
	if(this.alarmTargetState != targetState) {
		this.device.sendSetAlarmModeCommand(targetState, function(result) {
			callback();		
		});
	} else {
		callback();
	}
}

//////  Current State

/*
ELKAlarmPanelDevice.prototype.ALARM_STATE_NOT_READY_TO_ARM = 0;
ELKAlarmPanelDevice.prototype.ALARM_STATE_READY_TO_ARM = 1;
ELKAlarmPanelDevice.prototype.ALARM_STATE_READY_TO_ARM_VIOLATION = 2;
ELKAlarmPanelDevice.prototype.ALARM_STATE_ARMED_WITH_TIMER = 3;
ELKAlarmPanelDevice.prototype.ALARM_STATE_ARMED_FULLY = 4;
ELKAlarmPanelDevice.prototype.ALARM_STATE_FORCE_ARMED_VIOLATION = 5;
ELKAlarmPanelDevice.prototype.ALARM_STATE_ARMED_WITH_BYPASS = 6;
*/

/*
ELKAlarmPanelDevice.prototype.ALARM_TRIP_STATE_DISARMED = 0;
ELKAlarmPanelDevice.prototype.ALARM_TRIP_STATE_EXIT_DELAY = 1;
ELKAlarmPanelDevice.prototype.ALARM_TRIP_STATE_TRIPPED = 2;
*/

/*
Characteristic.SecuritySystemCurrentState.STAY_ARM = 0;
Characteristic.SecuritySystemCurrentState.AWAY_ARM = 1;
Characteristic.SecuritySystemCurrentState.NIGHT_ARM = 2;
Characteristic.SecuritySystemCurrentState.DISARMED = 3;
Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED = 4;
*/

ISYElkAlarmPanelAccessory.prototype.translateAlarmCurrentStateToHK = function() {
	var tripState = this.device.getAlarmTripState();
	if(tripState == this.device.ALARM_TRIP_STATE_DISARMED || tripState == this.device.ALARM_TRIP_STATE_EXIT_DELAY) {
		return Characteristic.SecuritySystemCurrentState.DISARMED;
	} else if(tripState ==this.device.ALARM_TRIP_STATE_TRIPPED) {
		return Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;
	} else {
		var sourceAlarmState = this.device.getAlarmMode();
		if(sourceAlarmState == this.device.ALARM_MODE_STAY || sourceAlarmState == this.device.ALARM_MODE_STAY_INSTANT ) {
			return Characteristic.SecuritySystemCurrentState.STAY_ARM;
		} else if(sourceAlarmState == this.device.ALARM_MODE_AWAY || sourceAlarmState == this.device.ALARM_MODE_VACATION) {
			return Characteristic.SecuritySystemCurrentState.AWAY_ARM;
		} else if(sourceAlarmState == this.device.ALARM_MODE_NIGHT || sourceAlarmState == this.device.ALARM_MODE_NIGHT_INSTANT) {
			return Characteristic.SecuritySystemCurrentState.NIGHT_ARM;
		} else {
			return Characteristic.SecuritySystemCurrentState.DISARM;
		}
	}
}

////// Target Mode

/*
ELKAlarmPanelDevice.prototype.ALARM_MODE_DISARMED = 0;
ELKAlarmPanelDevice.prototype.ALARM_MODE_AWAY = 1;
ELKAlarmPanelDevice.prototype.ALARM_MODE_STAY = 2;
ELKAlarmPanelDevice.prototype.ALARM_MODE_STAY_INSTANT = 3;
ELKAlarmPanelDevice.prototype.ALARM_MODE_NIGHT = 4;
ELKAlarmPanelDevice.prototype.ALARM_MODE_NIGHT_INSTANT = 5;
ELKAlarmPanelDevice.prototype.ALARM_MODE_VACATION = 6;
*/

/*
Characteristic.SecuritySystemTargetState.STAY_ARM = 0;
Characteristic.SecuritySystemTargetState.AWAY_ARM = 1;
Characteristic.SecuritySystemTargetState.NIGHT_ARM = 2;
Characteristic.SecuritySystemTargetState.DISARM = 3;
*/


ISYElkAlarmPanelAccessory.prototype.translateAlarmTargetStateToHK = function() {
	var sourceAlarmState = this.device.getAlarmMode();
	if(sourceAlarmState == this.device.ALARM_MODE_STAY || sourceAlarmState == this.device.ALARM_MODE_STAY_INSTANT ) {
 		return Characteristic.SecuritySystemTargetState.STAY_ARM;
	} else if(sourceAlarmState == this.device.ALARM_MODE_AWAY || sourceAlarmState == this.device.ALARM_MODE_VACATION) {
		return Characteristic.SecuritySystemTargetState.AWAY_ARM;
	} else if(sourceAlarmState == this.device.ALARM_MODE_NIGHT || sourceAlarmState == this.device.ALARM_MODE_NIGHT_INSTANT) {
		return Characteristic.SecuritySystemTargetState.NIGHT_ARM;
	} else {
		return Characteristic.SecuritySystemTargetState.DISARM;
	}
}

ISYElkAlarmPanelAccessory.prototype.translateHKToAlarmTargetState = function(state) {
	if(state == Characteristic.SecuritySystemTargetState.STAY_ARM) {
		return this.device.ALARM_MODE_STAY;
	} else if(state == Characteristic.SecuritySystemTargetState.AWAY_ARM) {
		return this.device.ALARM_MODE_AWAY;
	} else if(state == Characteristic.SecuritySystemTargetState.NIGHT_ARM) {
		return this.device.NIGHT_ARM;
	} else {
		return this.device.DISARM;
	}
}

ISYElkAlarmPanelAccessory.prototype.getAlarmTargetState = function(callback) {
	callback(null,this.translateAlarmTargetStateToHK());
}

ISYElkAlarmPanelAccessory.prototype.getAlarmCurrentState = function(callback) {
	callback(null,this.translateAlarmCurrentStateToHK());
}

ISYElkAlarmPanelAccessory.prototype.handleExternalChange = function() {
	this.alarmPanelService
		.setCharacteristic(Characteristic.SecuritySystemTargetState, this.translateAlarmTargetStateToHK());
	this.alarmPanelService
		.setCharacteristic(Characteristic.SecuritySystemCurrentState, this.translateAlarmCurrentStateToHK());
}

ISYElkAlarmPanelAccessory.prototype.getServices = function() {
	var informationService = new Service.AccessoryInformation();
	
	informationService
      .setCharacteristic(Characteristic.Manufacturer, "SmartHome")
      .setCharacteristic(Characteristic.Model, this.device.deviceFriendlyName)
      .setCharacteristic(Characteristic.SerialNumber, this.device.address);	
	  
	var alarmPanelService = new Service.SecuritySystem();
	
	this.alarmPanelService = alarmPanelService;
	this.informationService = informationService;	
    
    alarmPanelService
      .getCharacteristic(Characteristic.SecuritySystemTargetState)
      .on('set', this.setAlarmTargetState.bind(this));
	  
	alarmPanelService
	  .getCharacteristic(Characteristic.SecuritySystemTargetState)
	  .on('get', this.getAlarmTargetState.bind(this));
	  
	alarmPanelService
	  .getCharacteristic(Characteristic.SecuritySystemCurrentState)
	  .on('get', this.getAlarmCurrentState.bind(this));
    
    return [informationService, alarmPanelService];	
}

module.exports.platform = ISYPlatform;
module.exports.accessory = ISYFanAccessory;
module.exports.accessory = ISYLightAccessory;
module.exports.accessory = ISYLockAccessory;
module.exports.accessory = ISYOutletAccessory;
module.exports.accessory = ISYDoorWindowSensorAccessory;