; HELLO WORLD — the first vertical slice.
.title "HELLO WORLD"

update:
    LDI r0, 2               ; navy background
    SYS CLS
    LDI r0, msg
    LDI r1, 42              ; x
    LDI r2, 61              ; y
    LDI r3, 15              ; white
    SYS TEXT
    RET

.data
msg: .string "HELLO WORLD"
