#!/bin/sh

git config --global --add safe.directory $1
cd $1
npm install