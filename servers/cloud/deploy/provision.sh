#!/bin/sh
# Sets up a fresh Ubuntu 24.04 VPS to run Parley, and any other project, behind
# the shared Caddy proxy. Run it once, with sudo, as the admin user the VPS
# came with (README.md, "Set up the server"):
#
#   sudo sh deploy/provision.sh '<GitHub Actions public key>'
#
# Safe to run again.
set -eu

DEPLOY_KEY=${1:?usage: provision.sh '<GitHub Actions public key>'}
HERE=$(cd "$(dirname "$0")" && pwd)

# This turns off password sign-in. Make sure the admin user signs in with a
# key first, or the next SSH session can't get in.
ADMIN=${SUDO_USER:?run this with sudo from the admin user, not as root}
if [ ! -s "/home/$ADMIN/.ssh/authorized_keys" ]; then
  echo "$ADMIN has no SSH key in ~/.ssh/authorized_keys; add one first" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get install -y ca-certificates curl gnupg ufw unattended-upgrades

# Security updates install themselves.
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF

# SSH: keys only, and no root.
cat > /etc/ssh/sshd_config.d/10-provision.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
CONF
systemctl reload ssh

# Firewall: SSH and the web. Docker's published ports bypass these rules, which
# is why nothing but the proxy publishes one.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443
ufw --force enable

# Swap, so a memory spike slows the box down instead of killing a process.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Docker and the Doppler CLI, from their own apt repositories.
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
curl -fsSL --retry 3 'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' \
  | gpg --dearmor --yes -o /usr/share/keyrings/doppler-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" \
  > /etc/apt/sources.list.d/doppler-cli.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin doppler

# Container logs rotate, so they can't fill the disk.
cat > /etc/docker/daemon.json <<'CONF'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
CONF
systemctl restart docker

# The user GitHub Actions signs in as. Being in the docker group makes it
# root-equivalent on this box, so its key is the deploy key and nothing else.
id deploy > /dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
printf '%s\n' "$DEPLOY_KEY" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# Where the workflow copies Parley's deploy files, and where its Doppler token
# lives.
install -d -o deploy -g deploy /opt/parley
install -d -m 700 -o deploy -g deploy /etc/parley

# The shared proxy. deploy owns sites/ so each project's deploy can add its
# site.
#
# IPv6 on the network, so Docker forwards IPv6 visitors to Caddy with their own
# address. Without it Docker relays them through a proxy of its own, Caddy sees
# Docker's address for all of them, and they share one rate-limit budget.
docker network inspect proxy > /dev/null 2>&1 || docker network create --ipv6 proxy
install -d /opt/proxy/caddy
install -d -o deploy -g deploy /opt/proxy/caddy/sites
cp "$HERE/proxy/compose.yaml" /opt/proxy/compose.yaml
cp "$HERE/proxy/caddy/Caddyfile" /opt/proxy/caddy/Caddyfile
docker compose -f /opt/proxy/compose.yaml up -d

echo "Provisioned. Next: README.md, \"Set up the server\", step 4."
