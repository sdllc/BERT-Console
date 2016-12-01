
# if you want to build production, set this explicitly
# export NODE_ENV=production

# clean
rm -fr build/*
rm -fr bert-shell-win32-ia32
rm -fr bert-shell-win32-x64

# build
webpack -p

# install node modules.  note this is always production.
cd build
npm install --production

# now package
cd ..
node_modules/.bin/electron-packager build --platform=win32 --arch=all --icon=icon.ico
