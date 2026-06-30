#!/bin/bash
# Prevent Mac from sleeping ever
sudo pmset -a sleep 0
sudo pmset -a disksleep 0
sudo pmset -a displaysleep 0
sudo pmset -b sleep 0
echo "Laptop will stay awake, Sir"
