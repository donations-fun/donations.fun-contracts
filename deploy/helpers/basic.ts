import chalk from 'chalk';
import { outputJsonSync } from 'fs-extra';
import readlineSync from 'readline-sync';

export function loadConfig(networkName: string) {
    return require(`${__dirname}/../../config/${networkName}.json`);
}

export function saveConfig(config: any, networkName: string) {
    writeJSON(config, `${__dirname}/../../config/${networkName}.json`);
}

export const writeJSON = (data, name) => {
    outputJsonSync(name, data, {
        spaces: 2,
        EOL: '\n',
    });
};
export const printInfo = (msg, info = '', colour = chalk.green) => {
    if (info) {
        console.log(`${msg}: ${colour(info)}\n`);
    } else {
        console.log(`${msg}\n`);
    }
};
export const printWarn = (msg, info = '') => {
    if (info) {
        msg = `${msg}: ${info}`;
    }

    console.log(`${chalk.italic.yellow(msg)}\n`);
};
export const printError = (msg, info = '') => {
    if (info) {
        msg = `${msg}: ${info}`;
    }

    console.log(`${chalk.bold.red(msg)}\n`);
};
export const prompt = (question, yes = false) => {
    // skip the prompt if yes was passed
    if (yes) {
        return false;
    }

    const answer = readlineSync.question(`${question} ${chalk.green('(y/n)')} `);
    console.log();

    return answer !== 'y';
};

export const getSaltFromKey = (key: string) => {
    return keccak256(AbiCoder.defaultAbiCoder().encode(['string'], [key.toString()]));
};
