import os

path = r"c:\Users\User\Desktop\leef new\leef test\leef-userinterfce\frontend\refund-approval.html"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

replacements = [
    (
        ".refund-card {\n      background: #1a1a1a;",
        "body { background: #ffffff !important; color: #222 !important; }\n    .page-title { color: #222 !important; }\n    .page-subtitle { color: #555 !important; }\n    .refund-card {\n      background: #fff;\n      box-shadow: 0 4px 20px rgba(0,0,0,0.07);"
    ),
    (
        "border: 1px solid #333;\n      border-radius: 12px;",
        "border: 1px solid #eee;\n      border-radius: 12px;"
    ),
    (
        "background: #1a1a1a;\n      border: 1px solid #333;\n      border-radius: 8px;\n      color: #eee;",
        "background: #fff;\n      border: 1px solid #ddd;\n      border-radius: 8px;\n      color: #333;"
    ),
    (
        "background: #111;\n      border: 1px solid #333;\n      border-radius: 6px;\n      color: #fff;",
        "background: #fff;\n      border: 1px solid #ddd;\n      border-radius: 6px;\n      color: #222;"
    ),
    (
        "font-weight:700;color:#fff;font-size:1rem;",
        "font-weight:700;color:#222;font-size:1rem;"
    ),
    (
        "background:rgba(0,0,0,0.2); border-radius:10px; border:1px solid #222;",
        "background:#f9f9f9; border-radius:10px; border:1px solid #eee;"
    ),
    (
        "rgba(59,130,246,0.1)' : 'rgba(168,85,247,0.1)'}; padding:0.5rem 0.7rem; border-radius:8px; border:1px solid ${m.sender_role === 'admin' ? '#1d4ed8' : '#7e22ce'",
        "#eff6ff' : '#f3e8ff'}; padding:0.5rem 0.7rem; border-radius:8px; border:1px solid ${m.sender_role === 'admin' ? '#bfdbfe' : '#e9d5ff'"
    ),
    (
        "font-size:0.85rem; color:#eee;",
        "font-size:0.85rem; color:#111;"
    ),
    (
        "background:#111; border-radius:8px; border:1px solid #333;",
        "background:#f9f9f9; border-radius:8px; border:1px solid #eee;"
    ),
    (
        "font-size:0.9rem; color:#fff; font-weight:600;",
        "font-size:0.9rem; color:#222; font-weight:600;"
    ),
    (
        "border:1px solid #333;\"></a>",
        "border:1px solid #ddd;\"></a>"
    ),
    (
        "background:#1a1a1a; border:1px solid #333; border-radius:12px; padding:2rem; width:100%; max-width:480px; color:#eee;",
        "background:#fff; border:1px solid #eee; box-shadow:0 10px 40px rgba(0,0,0,0.1); border-radius:12px; padding:2rem; width:100%; max-width:480px; color:#222;"
    ),
    (
        "color:#ccc",
        "color:#555"
    ),
    (
        "background:#111; padding:0.8rem; border-radius:8px; border:1px solid #333;",
        "background:#f9f9f9; padding:0.8rem; border-radius:8px; border:1px solid #eee;"
    ),
    (
        "background:#111; color:#fff; border:1px solid #333;",
        "background:#fff; color:#222; border:1px solid #ddd;"
    )
]

for target, replacement in replacements:
    content = content.replace(target, replacement)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Replaced content successfully.")
