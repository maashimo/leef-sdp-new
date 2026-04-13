import os

path = r"c:\Users\User\Desktop\leef new\leef test\leef-userinterfce\frontend\new-registration.html"

with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Check if the last line has multiple </html> tags
if lines and "</html></html>" in lines[-1]:
    lines[-1] = lines[-1].replace("</html></html>", "</html>")
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print("Fixed duplicate tags.")
else:
    print("No duplicate tags found or already fixed.")
