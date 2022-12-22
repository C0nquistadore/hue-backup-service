<a href="https://www.philips-hue.com"><img src="https://upload.wikimedia.org/wikipedia/commons/3/3a/Philips_Hue_logo.svg" width="150"></a>

# Philips Hue Backup Service

[![npm](https://img.shields.io/npm/v/hue-backup-service?style=for-the-badge)](https://www.npmjs.com/package/hue-backup-service) [![Build and Lint](https://img.shields.io/github/actions/workflow/status/c0nquistadore/hue-backup-service/build.yml?style=for-the-badge)](https://github.com/C0nquistadore/hue-backup-service/actions/workflows/build.yml)

This small node application connects to the Philips Hue bridge, gets the current data and dumps it on file. It can be used in conjunction with crontab to create backups periodically.

## 📦 Install
To install the package, npm is required. Please make sure first to have node/npm installed. You can get it here: https://nodejs.org/en/download/.

If you have npm up and running, you can install the package globally:

```shell
npm install -g hue-backup-service
```

## 🚀 Run
To collect a latest backup of the hue bridge, simply run:


```shell
hue-backup-service
```

If this is your first run, follow the steps to authenticate with your Philips Hue bridge.

To get more verbose output, simply add the `--verbose` flag like so:

```shell
hue-backup-service --verbose
```

## ⏰ Schedule
You can create a linux cron job to perform backups periodically. To so edit your user's crontab by running the following command:

```shell
sudo crontab -e -u $USER
```

Create a new entry that runs the following command:

```shell
hue-backup-service --verbose > ~/.hue-backup-service/cron.log
```

You can use https://crontab-generator.org to generate the correct syntax for your desired job execution interval.

## 🛠️ Configure
Only the latest 14 backups are kept to preserve disk space. You can change the number of backups to keep by setting the `retentionCount` property in the configuration file `~/.hue-backup-service` like so:


```json
{
  ...
  "retentionCount": 14
}
```