// volume-probe — list every CoreAudio OUTPUT device with its device-level
// volume and mute state, as JSON on stdout.
//
//   [{"name":"KT USB Audio 2","volume":0.757,"muted":false}, …]
//
// Why this exists: the OS-level output volume of the KT cable scales the
// FSK send even though the app pins its element volume to 1.0 — found at
// −6.5 dB on 2026-09-24, every send reached the JX at half amplitude and
// was rejected (trap #39). No web API exposes device volume and
// system_profiler doesn't report it, so the app shells out to this probe
// (vendored like uv) before a send and warns when the picked cable's
// output is below full.
//
// volume: master element first, else the average of channels 1+2, else
// null (a device with no volume control — nothing to warn about).
// Compiled by scripts/setup-vendor.mjs (macOS only): swiftc -O.

import CoreAudio
import Foundation

func propData<T>(_ objectID: AudioObjectID, _ selector: AudioObjectPropertySelector,
                 _ scope: AudioObjectPropertyScope, _ element: UInt32, _ value: inout T) -> Bool {
  var addr = AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: element)
  guard AudioObjectHasProperty(objectID, &addr) else { return false }
  var size = UInt32(MemoryLayout<T>.size)
  return AudioObjectGetPropertyData(objectID, &addr, 0, nil, &size, &value) == noErr
}

func deviceIDs() -> [AudioObjectID] {
  var addr = AudioObjectPropertyAddress(
    mSelector: kAudioHardwarePropertyDevices,
    mScope: kAudioObjectPropertyScopeGlobal,
    mElement: kAudioObjectPropertyElementMain)
  var size: UInt32 = 0
  guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size) == noErr
  else { return [] }
  var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
  guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &ids) == noErr
  else { return [] }
  return ids
}

func outputChannelCount(_ id: AudioObjectID) -> Int {
  var addr = AudioObjectPropertyAddress(
    mSelector: kAudioDevicePropertyStreamConfiguration,
    mScope: kAudioObjectPropertyScopeOutput,
    mElement: kAudioObjectPropertyElementMain)
  var size: UInt32 = 0
  guard AudioObjectGetPropertyDataSize(id, &addr, 0, nil, &size) == noErr, size > 0 else { return 0 }
  let buf = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: MemoryLayout<AudioBufferList>.alignment)
  defer { buf.deallocate() }
  guard AudioObjectGetPropertyData(id, &addr, 0, nil, &size, buf) == noErr else { return 0 }
  let abl = UnsafeMutableAudioBufferListPointer(buf.assumingMemoryBound(to: AudioBufferList.self))
  return abl.reduce(0) { $0 + Int($1.mNumberChannels) }
}

var rows: [String] = []
for id in deviceIDs() {
  guard outputChannelCount(id) > 0 else { continue }
  var nameRef: CFString = "" as CFString
  guard propData(id, kAudioObjectPropertyName, kAudioObjectPropertyScopeGlobal,
                 kAudioObjectPropertyElementMain, &nameRef) else { continue }
  let name = nameRef as String

  var volume: Float32 = -1
  var haveVolume = propData(id, kAudioDevicePropertyVolumeScalar,
                            kAudioObjectPropertyScopeOutput, 0, &volume)
  if !haveVolume {
    var v1: Float32 = -1, v2: Float32 = -1
    let h1 = propData(id, kAudioDevicePropertyVolumeScalar, kAudioObjectPropertyScopeOutput, 1, &v1)
    let h2 = propData(id, kAudioDevicePropertyVolumeScalar, kAudioObjectPropertyScopeOutput, 2, &v2)
    if h1 || h2 { volume = (max(v1, 0) + max(v2, 0)) / Float32((h1 ? 1 : 0) + (h2 ? 1 : 0)); haveVolume = true }
  }

  // The dB reading comes from CoreAudio itself (kAudioDevicePropertyVolume-
  // Decibels), NOT 20*log10(scalar): the scalar-to-dB curve is device-
  // specific, and the number shown must match what the user sees in Audio
  // MIDI Setup (0.757 on the KT is -6.5 dB there, not the -2.4 naive math
  // gives).
  var db: Float32 = 0
  var haveDb = propData(id, kAudioDevicePropertyVolumeDecibels,
                        kAudioObjectPropertyScopeOutput, 0, &db)
  if !haveDb {
    var d1: Float32 = 0, d2: Float32 = 0
    let h1 = propData(id, kAudioDevicePropertyVolumeDecibels, kAudioObjectPropertyScopeOutput, 1, &d1)
    let h2 = propData(id, kAudioDevicePropertyVolumeDecibels, kAudioObjectPropertyScopeOutput, 2, &d2)
    if h1 || h2 { db = (d1 + d2) / Float32((h1 ? 1 : 0) + (h2 ? 1 : 0)); haveDb = true }
  }

  var muteVal: UInt32 = 0
  let haveMute = propData(id, kAudioDevicePropertyMute, kAudioObjectPropertyScopeOutput, 0, &muteVal)

  let esc = name.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
  rows.append("{\"name\":\"\(esc)\","
    + "\"volume\":\(haveVolume ? String(format: "%.4f", volume) : "null"),"
    + "\"db\":\(haveDb ? String(format: "%.1f", db) : "null"),"
    + "\"muted\":\(haveMute ? (muteVal != 0 ? "true" : "false") : "false")}")
}
print("[" + rows.joined(separator: ",") + "]")
