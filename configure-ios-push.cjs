// Called by Codemagic after cap sync. Opt-in flag avoids breaking existing signing profiles.
const fs=require('node:fs');
const cp=require('node:child_process');
if(process.env.ENABLE_PUSH_NOTIFICATIONS!=='1'){
 console.log('Push capability disabled: set ENABLE_PUSH_NOTIFICATIONS=1 after updating the Apple provisioning profile.');
 process.exit(0);
}
const file='ios/App/App/AppDelegate.swift';let source=fs.readFileSync(file,'utf8');
if(!source.includes('didRegisterForRemoteNotificationsWithDeviceToken')){
 const end=source.lastIndexOf('}');if(end<0)throw Error('AppDelegate format not recognized');
 source=source.slice(0,end)+`
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
`+source.slice(end);fs.writeFileSync(file,source);
}
const entitlements='ios/App/App/App.entitlements';
try{cp.execFileSync('/usr/libexec/PlistBuddy',['-c','Delete :aps-environment',entitlements],{stdio:'ignore'})}catch{}
cp.execFileSync('/usr/libexec/PlistBuddy',['-c','Add :aps-environment string production',entitlements]);
cp.execFileSync('plutil',['-lint',entitlements],{stdio:'inherit'});
