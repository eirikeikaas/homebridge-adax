import { PlatformAccessory, Service } from 'homebridge';

import { ADAXHomebridgePlatform } from './platform';

export class ADAXPlatformAccessory {
  private service: Service;

  private roomState = {
    id: null,
    heatingEnabled: true,
    targetTemperature: 1800,
    temperature: 1800,
  };

  constructor(
    private readonly platform: ADAXHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ADAX')
      .setCharacteristic(this.platform.Characteristic.Model, 'N/A')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'N/A');

    this.service =
      this.accessory.getService(this.platform.Service.Thermostat) ||
      this.accessory.addService(this.platform.Service.Thermostat);

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.name,
    );

    this.service
      .getCharacteristic(
        this.platform.Characteristic.CurrentHeatingCoolingState,
      )
      .on('get', this.handleCurrentHeatingCoolingStateGet.bind(this))
      .setProps({
        // heater can be HEATing or OFF
        validValues: [
          this.platform.Characteristic.CurrentHeatingCoolingState.HEAT,
          this.platform.Characteristic.CurrentHeatingCoolingState.OFF,
        ],
      });

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .on('get', this.handleTargetHeatingCoolingStateGet.bind(this))
      .on('set', this.handleTargetHeatingCoolingStateSet.bind(this))
      .setProps({
        validValues: [
          // only use HEAT and OFF
          this.platform.Characteristic.TargetHeatingCoolingState.HEAT,
          this.platform.Characteristic.TargetHeatingCoolingState.OFF,
        ],
      });
    this.service
      .getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .on('get', this.handleTemperatureDisplayUnitsGet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .on('get', this.handleCurrentTemperatureGet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .on('get', this.handleTargetTemperatureGet.bind(this))
      .on('set', this.handleTargetTemperatureSet.bind(this))
      .setProps({
        // min and max are defined in the ADAX API
        // step is a chosen sensible constraint
        minValue: 5,
        minStep: 0.5,
        maxValue: 35,
      });

    this.roomState = accessory.context.device;
  }

  getRoom() {
    return this.platform.getHome().then((home) => {
      const room = home.rooms.filter((e) => {
        return e.id === this.accessory.context.device.id;
      })[0];

      this.roomState = room;

      return room;
    });
  }

  // round target temps to 0.5C
  // this should match minStep
  targetPrecision(number: number) {
    return parseFloat((Math.round(number * 2) / 2).toFixed(1));
  }

  // round current temps to 0.1C
  currentPrecision(number: number) {
    return parseFloat(number.toFixed(1));
  }

  // return the current heating state:
  // OFF = not heating (heater off or target reached)
  // HEAT = currently heating (target temperature not reached)
  currentHeatingState() {
    const { OFF, HEAT } =
      this.platform.Characteristic.CurrentHeatingCoolingState;
    // let heatingEnabled be a var, not a const
    // eslint-disable-next-line prefer-const
    let { heatingEnabled, targetTemperature, temperature } = this.roomState;
    let state = OFF;

    // if heating is enabled, then
    if (heatingEnabled) {
      // If we get an error handling the temperatures then mark the heater as 'OFF'
      try {
        // if the target temp is above the current temp, then
        // the heater is heating, ie. HEAT, otherwise OFF
        state = targetTemperature > temperature ? HEAT : OFF;
      } catch (e) {
        state = OFF;
      }
    } else {
      state = OFF;
    }

    return state;
  }

  // return the target heating state
  // OFF - turned off
  // HEAT - heating mode
  // COOL - cooling mode (doesn't apply)
  // AUTO - auto switch between heat/cool (doesn't apply)
  targetHeatingState() {
    const { OFF, HEAT } =
      this.platform.Characteristic.TargetHeatingCoolingState;
    // let heatingEnabled be a var, not a const
    // eslint-disable-next-line prefer-const
    let { heatingEnabled } = this.roomState;

    // HEAT when the heating is enabled, otherwise OFF
    return heatingEnabled ? HEAT : OFF;
  }

  handleCurrentHeatingCoolingStateGet(callback) {
    this.platform.log.debug('Triggered GET Current State');
    callback(null, this.currentHeatingState());
  }

  handleTargetHeatingCoolingStateGet(callback) {
    this.platform.log.debug('Triggered GET Target State');
    callback(null, this.targetHeatingState());
  }

  // if state is OFF, then set heatingEnabled false
  // if state is HEAT, then set heatingEnabled true, and
  //    set the targetTemperature to the currentTemperature
  // the targetTemperature will probably be changed by the user
  // almost immediately anyway...
  handleTargetHeatingCoolingStateSet(value, callback) {
    this.platform.log.info(`Set Target Heating Cooling State to ${value}`);
    const { id } = this.accessory.context.device;

    if (value === this.platform.Characteristic.TargetHeatingCoolingState.OFF) {
      // turn heating off
      this.platform
        .setRoom(id, {
          heatingEnabled: false,
        })
        .then(() => {
          callback(null);
        });
    } else {
      // turn heating on
      this.platform
        .setRoom(id, {
          targetTemperature: `${this.roomState.temperature}`,
          heatingEnabled: true,
        })
        .then(() => {
          this.roomState.targetTemperature = this.roomState.temperature;
          this.roomState.heatingEnabled = true;
          callback(null);
        });
    }
  }

  handleCurrentTemperatureGet(callback) {
    this.getRoom().then((state) => {
      if (!state.temperature) {
        state.temperature = 500;
      }
      this.platform.log.debug(
        `Triggered GET Current Temp ${state.temperature / 100}C`,
      );
      callback(null, this.currentPrecision(state.temperature / 100));
    });
  }

  handleTemperatureDisplayUnitsGet(callback) {
    callback(
      null,
      this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS,
    );
  }

  handleTargetTemperatureGet(callback) {
    this.getRoom().then((state) => {
      let temperature = 5.0;
      // if this fails, just return 5.0C anyway
      temperature = this.targetPrecision(state.targetTemperature / 100);
      if (Number.isNaN(temperature)) {
        this.platform.log.debug('--> fixup temperature in GET Target Temp');
        temperature = 5.0;
      }

      this.platform.log.debug(`Triggered GET Target Temp ${temperature}C`);
      callback(null, temperature);
    });
  }

  handleTargetTemperatureSet(value, callback) {
    this.platform.log.debug(`Triggered SET Target Temp ${value}`);
    const { id } = this.accessory.context.device;

    this.platform
      .setRoom(id, {
        targetTemperature: value * 100,
        heatingEnabled: true,
      })
      .then(() => {
        callback(null);
      });
  }
}
