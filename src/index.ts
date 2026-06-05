#!/usr/bin/env node
import dotenv from 'dotenv';
import {
  runDoctorCommand,
  runInitCommand,
  runLoginCommand,
  runLogoutCommand,
  runServeCommand,
  runWhoAmICommand,
} from './cli.js';

dotenv.config();

const command = process.argv[2] ?? 'serve';

switch (command) {
  case 'init':
    await runInitCommand();
    break;
  case 'doctor':
    await runDoctorCommand();
    break;
  case 'login':
    await runLoginCommand();
    break;
  case 'whoami':
    await runWhoAmICommand();
    break;
  case 'serve':
    await runServeCommand();
    break;
  case 'logout':
    await runLogoutCommand();
    break;
  default:
    throw new Error(
      `Unknown command "${command}". Use one of: init, doctor, login, whoami, serve, logout.`,
    );
}
