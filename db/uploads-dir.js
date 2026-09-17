const path = require('node:path');

// UPLOADS_DIR permite apontar para outra pasta (usado em testes automatizados,
// pra nunca escrever/apagar nada na pasta uploads/ real). Os caminhos salvos
// no banco (documents.file_path) sao sempre relativos a essa pasta.
module.exports = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
