UUID = speed-cursor@local

.PHONY: all schemas pack install uninstall prefs clean

all: schemas

schemas:
	glib-compile-schemas --strict schemas/

pack: schemas
	gnome-extensions pack --force --extra-source=icons .

install:
	./install.sh

uninstall:
	./uninstall.sh

prefs:
	gnome-extensions prefs $(UUID)

clean:
	rm -f $(UUID).shell-extension.zip schemas/gschemas.compiled
