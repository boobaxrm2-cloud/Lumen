// Dropzone da foto de perfil em "Minha conta", no mesmo estilo/comportamento
// do dropzone de PDF em public/js/leitura.js.

const dropzoneAvatar = document.getElementById('dropzone-avatar');
const campoAvatar = document.getElementById('avatar-input');
const dropzoneAvatarTexto = document.getElementById('dropzone-avatar-texto');

if (dropzoneAvatar && campoAvatar) {
  const I18N_CONTA_TXT = window.I18N_CONTA;

  function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
  }

  campoAvatar.addEventListener('change', () => {
    const arquivo = campoAvatar.files[0];
    if (!arquivo) return;
    dropzoneAvatarTexto.innerHTML = `<strong>${escaparHtml(arquivo.name)}</strong><small>${escaparHtml(I18N_CONTA_TXT.avatarChangeHint)}</small>`;
  });

  ['dragover', 'dragenter'].forEach((evento) => {
    dropzoneAvatar.addEventListener(evento, (e) => {
      e.preventDefault();
      dropzoneAvatar.classList.add('arrastando');
    });
  });

  ['dragleave', 'dragend'].forEach((evento) => {
    dropzoneAvatar.addEventListener(evento, () => {
      dropzoneAvatar.classList.remove('arrastando');
    });
  });

  dropzoneAvatar.addEventListener('drop', (evento) => {
    evento.preventDefault();
    dropzoneAvatar.classList.remove('arrastando');

    const arquivo = evento.dataTransfer.files[0];
    if (!arquivo) return;

    campoAvatar.files = evento.dataTransfer.files;
    campoAvatar.dispatchEvent(new Event('change'));
  });
}
