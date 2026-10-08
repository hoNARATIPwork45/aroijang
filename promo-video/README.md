# วิดีโอโปรโมต อิ่มจัง (30 วิ, วนลูปได้)

`out/aroijang-promo-30s.mp4`: 1920×1080, 60fps, H.264 + AAC ยาว 30.000 วินาทีพอดี
จังหวะ 128 BPM = 16 ห้องเพลง (64 บีต) ทั้งภาพและเสียงถูกคำนวณจากเวลาแบบวงกลม ตอนจบจึงต่อกับตอนเริ่มได้เนียน

| เวลา | ฉาก |
|---|---|
| 0.0–3.75 | โลโก้ 3D ตกกระแทก + "หิวแล้ว ใช่มั้ย?" |
| 3.75–11.25 | แผนที่ 3D: วงรัศมี 500 ม. เรดาร์กวาดแล้วหมุดร้านเด้งขึ้น |
| 11.25–16.9 | การ์ดเมนูจริงจากเว็บ + ป้ายลดราคา |
| 16.9–24.4 | ร้านค้า "ไม่เก็บค่าคอม 0%" + เหรียญร่วง |
| 24.4–30 | มือถือแสดงหน้าเว็บจริง + URL แล้วโลโก้บินกลับไปต้นคลิป |

## แก้ไข / เรนเดอร์ใหม่

ต้องมี Node (ติดตั้ง `three` ด้วย `npm install`) และ Python ที่มี playwright, numpy, scipy, opencv, imageio-ffmpeg

```bash
python tools/render.py --stills 0,5,12.5        # ภาพนิ่งไว้ตรวจ -> out/stills/
python tools/render.py --cues                   # export จังหวะเสียงประกอบ -> out/cues.json
python tools/make_audio.py                      # สังเคราะห์เพลง+เอฟเฟกต์ -> out/soundtrack.wav
python tools/render.py --video --fps 60 --png   # วิดีโอเต็ม -> out/aroijang-promo-30s.mp4
```

### ใช้เพลงจากไฟล์แทนเพลงที่สังเคราะห์

```bash
python tools/analyze_song.py music/theme.wav            # หา BPM + บีต -> music/beats.json
python tools/make_voice.py                              # เสียงใหม่ "ครัวอิ่มจัง" (edge-tts) ลงจังหวะท่อนเดิม
python tools/patch_theme.py                             # ลบ "ครัวคุณต๋อย" (แปะดนตรีท่อนซ้ำที่ไม่มีเสียงร้อง) + ใส่เสียงใหม่
python tools/make_song_loop.py 4 music/theme_patched.wav  # ตัด 64 บีตเริ่มบีตที่ 4 ยืดเป็น 128 BPM = 30 วิ วนลูปได้
python tools/make_audio.py --song music/song_loop.wav   # ผสมกับเสียงเอฟเฟกต์ -> out/soundtrack_song.wav
```

แล้วเอาเสียงใส่วิดีโอเดิมโดยไม่ต้องเรนเดอร์ภาพใหม่ (ffmpeg `-map 0:v -map 1:a -c:v copy`)
โฟลเดอร์ `music/` ตั้ง gitignore ไว้ เพราะเพลงมีลิขสิทธิ์ อย่าอัปขึ้น repo สาธารณะ

- ข้อความทั้งหมดและเวลาของแต่ละฉาก: `src/shots.js` (นับเป็นบีต 1 บีต = 0.46875 วิ)
- ของ 3D (ไข่ดาว ชาไทย พริก หมูปิ้ง เหรียญ หมุด มือถือ รถเข็น เมือง): `src/props.js`
- รูปมาสคอต/โลโก้แบบสติกเกอร์ไดคัท สร้างจาก `../assets` ด้วย `tools/prep_assets.py`
- ภาพหน้าเว็บบนมือถือ: `tools/capture_site.py` (ถ่ายจากเว็บจริง)
